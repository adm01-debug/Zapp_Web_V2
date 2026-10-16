-- training_score_rpc
-- Rollback: remove o gatilho que tira a nota do cliente, a RPC complete_training_session e o motor de nota em SQL; nenhum dado de sessão é tocado (as notas já gravadas ficam como estão).
-- Rollback (SQL executável, na ordem):
--   DROP TRIGGER IF EXISTS trg_training_sessions_nota_so_por_rpc ON public.training_sessions;
--   DROP FUNCTION IF EXISTS public.prevent_client_training_score();
--   DROP FUNCTION IF EXISTS public.complete_training_session(uuid);
--   DROP FUNCTION IF EXISTS public.calculate_training_score(jsonb);
--
-- PROBLEMA (cartão t_48369edd, achado R2-AUTH-037)
-- O cálculo da nota do Modo Treinamento ficou certo no cliente (#261), mas a GRAVAÇÃO
-- continuou aberta: `training_sessions` aceita UPDATE do próprio dono (policy "Users can
-- update own training sessions") e não tem nenhuma trava de coluna. Quem chama a API
-- direto — sem passar pela tela — grava `score = 100`, `feedback` e `status = 'completed'`
-- na própria sessão. O mesmo `score` que alimenta a avaliação de desempenho (badge e
-- histórico em TrainingMode.tsx) continua, portanto, sendo informado pelo cliente.
--
-- CORREÇÃO (aditiva: nenhuma policy, GRANT de tabela, coluna ou linha é removida)
--   1) `calculate_training_score(jsonb)` — o motor da nota passa a existir no banco,
--      como porte fiel de `avaliarTreinamento` (TrainingMode.tsx): resposta do atendente
--      (trim, >= 60 caracteres) vale "detalhe"; ordem de próximo passo vale "acao";
--      reconhecimento vale "empatia"; nota = 40 + 60 * atendidos / (3 * respostas),
--      limitada a 40..100; >= 80 "Excelente", senão o feedback lista o critério que
--      faltou. Mesmo texto => mesma nota.
--   2) `complete_training_session(uuid)` (SECURITY DEFINER) — é o ÚNICO caminho de
--      escrita da nota: trava a linha da sessão (`FOR UPDATE`), confere que a sessão é do
--      dono (mesma regra da policy: `profile_id` do usuário, ou admin/supervisor),
--      recalcula a nota a partir de `messages` já gravadas no banco e grava
--      score/feedback/status='completed'/completed_at na MESMA operação. Sessão de outro
--      dono e sessão inexistente devolvem a MESMA mensagem/erro: a RPC não vira oráculo
--      de existência de sessão.
--   3) Gatilho `trg_training_sessions_nota_so_por_rpc` (BEFORE INSERT OR UPDATE) —
--      fecha a escrita direta: papel de cliente (`authenticated`, `anon`) não grava
--      `score`, `feedback` nem `completed_at`, não nasce sessão já concluída
--      (`status = 'completed'` no INSERT) e não entra nem sai de `completed` por
--      UPDATE direto; o caminho do servidor (a própria RPC, cujo dono é `postgres`,
--      e `service_role`) segue liberado. As demais colunas da linha (por exemplo
--      `messages`, gravada a cada resposta) continuam como estavam.
--
-- ACL (negar por padrão): as três funções nascem sem EXECUTE para PUBLIC/anon;
-- `authenticated` só recebe `complete_training_session(uuid)`; o motor de nota é interno
-- (quem chama é a RPC, definer). Nenhum GRANT de tabela/policy é alterado.
--
-- COMPATIBILIDADE: a tela (worker de telas/hooks) ainda grava a conclusão direto em
-- `training_sessions`; a partir desta migration esse UPDATE é recusado e a conclusão
-- precisa passar por `supabase.rpc('complete_training_session', { p_session_id })`.
-- Registrado para o cartão da tela.

SET search_path = public, pg_temp;

-- ============================================================================
-- 1) Motor único da nota (porte fiel de avaliarTreinamento, TrainingMode.tsx)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_training_score(p_messages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total      integer;
  v_atendidos  integer;
  v_score      integer;
  v_falta_det  boolean;
  v_falta_acao boolean;
  v_falta_emp  boolean;
  v_faltas     text[] := ARRAY[]::text[];
  v_qtd_faltas integer;
  v_prefixo    text;
  v_feedback   text;
BEGIN
  -- Só as respostas DO ATENDENTE contam; a fala do cliente fica de fora.
  WITH avaliado AS (
    SELECT (length(btrim(COALESCE(elem->>'content', ''), E' \t\n\r\f\v')) >= 60) AS ok_detalhe,
           (btrim(COALESCE(elem->>'content', ''), E' \t\n\r\f\v')
              ~* '\m(vou|irei|vamos|encaminh\w*|verific\w*|resolv\w*|solucion\w*|providenci\w*|ajust\w*|chec\w*|analis\w*)\M') AS ok_acao,
           (btrim(COALESCE(elem->>'content', ''), E' \t\n\r\f\v')
              ~* '\m(entendo|entendi|compreendo|compreendi|desculpe|desculpa|sinto muito|lamento|imagino)\M') AS ok_empatia
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_messages) = 'array' THEN p_messages
                  ELSE '[]'::jsonb END) AS elem
     WHERE elem->>'role' = 'agent'
  )
  SELECT count(*),
         COALESCE(sum((ok_detalhe)::int + (ok_acao)::int + (ok_empatia)::int), 0),
         NOT COALESCE(bool_and(ok_detalhe), true),
         NOT COALESCE(bool_and(ok_acao), true),
         NOT COALESCE(bool_and(ok_empatia), true)
    INTO v_total, v_atendidos, v_falta_det, v_falta_acao, v_falta_emp
    FROM avaliado;

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'score', 40,
      'feedback', 'Nenhuma resposta do atendente foi registrada nesta sessão.');
  END IF;

  v_score := LEAST(100, GREATEST(40, 40 + round(60.0 * v_atendidos / (3 * v_total))::integer));

  IF v_score >= 80 THEN
    RETURN jsonb_build_object(
      'score', v_score,
      'feedback', 'Excelente! Respostas completas, com empatia e próximo passo claro.');
  END IF;

  IF v_falta_det  THEN v_faltas := array_append(v_faltas, 'detalhar mais a resposta');         END IF;
  IF v_falta_acao THEN v_faltas := array_append(v_faltas, 'declarar o próximo passo');        END IF;
  IF v_falta_emp  THEN v_faltas := array_append(v_faltas, 'reconhecer a situação do cliente'); END IF;

  v_prefixo := CASE WHEN v_score >= 60 THEN 'Bom, mas faltou' ELSE 'Precisa melhorar: faltou' END;
  v_qtd_faltas := array_length(v_faltas, 1);

  -- Duas ou mais faltas é a única forma de a nota ficar abaixo de 80 (uma resposta vale
  -- 3 pontos em 3*n): o ramo de UMA falta existe só para manter o texto igual ao do
  -- cliente (listar() em TrainingMode.tsx).
  v_feedback := v_prefixo || ' ' ||
    CASE WHEN v_qtd_faltas = 1 THEN v_faltas[1]
         ELSE array_to_string(v_faltas[1 : v_qtd_faltas - 1], ', ') || ' e ' || v_faltas[v_qtd_faltas]
    END || '.';

  RETURN jsonb_build_object('score', v_score, 'feedback', v_feedback);
END
$fn$;

COMMENT ON FUNCTION public.calculate_training_score(jsonb) IS
  'Nota do Modo Treinamento calculada no banco a partir de training_sessions.messages (porte de avaliarTreinamento). Uso interno: complete_training_session.';

-- ============================================================================
-- 2) RPC dona da conclusão: recalcula a nota e grava (único caminho de escrita)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_training_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sessao    public.training_sessions%ROWTYPE;
  v_resultado jsonb;
BEGIN
  -- Linha travada + checagem de dono na MESMA consulta. A mensagem do erro é única e
  -- igual para "não é sua" e "não existe": nada aqui revela se a sessão existe.
  SELECT s.* INTO v_sessao
    FROM public.training_sessions AS s
   WHERE s.id = p_session_id
     AND (s.profile_id = public.get_profile_id_for_user(auth.uid())
          OR public.is_admin_or_supervisor(auth.uid()))
   ORDER BY s.id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sessão de treinamento não encontrada ou não pertence ao usuário'
      USING ERRCODE = '42501';
  END IF;

  v_resultado := public.calculate_training_score(v_sessao.messages);

  UPDATE public.training_sessions
     SET score        = (v_resultado->>'score')::integer,
         feedback     = v_resultado->>'feedback',
         status       = 'completed',
         completed_at = COALESCE(v_sessao.completed_at, now())
   WHERE id = v_sessao.id;

  RETURN jsonb_build_object(
    'score',    (v_resultado->>'score')::integer,
    'feedback', v_resultado->>'feedback');
END
$fn$;

COMMENT ON FUNCTION public.complete_training_session(uuid) IS
  'Conclui uma sessão de treinamento do próprio usuário: recalcula a nota a partir das respostas gravadas e devolve {score, feedback}. É o único caminho de escrita de training_sessions.score.';

-- ============================================================================
-- 3) Gatilho: a nota e a conclusão não vêm do cliente
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_client_training_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Caminho do servidor: a RPC (definer de propriedade do postgres) e service_role.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Colunas de resultado só nascem pela RPC: nada de sessão já concluída, com
    -- nota, feedback ou carimbo vindos do cliente (refazer 1: o ramo antigo só
    -- checava score e deixava passar INSERT com status='completed').
    IF NEW.score IS NOT NULL THEN
      RAISE EXCEPTION 'a nota do treinamento é calculada no servidor: use a RPC complete_training_session'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS NOT DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'a conclusão do treinamento é definida no servidor: use a RPC complete_training_session'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.feedback IS NOT NULL THEN
      RAISE EXCEPTION 'o feedback do treinamento é definido no servidor: use a RPC complete_training_session'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a conclusão do treinamento é definida no servidor: use a RPC complete_training_session'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: o resultado (score/feedback/completed_at) só é escrito pela RPC,
  -- em qualquer estado da sessão; a conclusão só entra pela RPC e nunca sai
  -- por UPDATE direto (refazer 1: o ramo antigo deixava sobrescrever o
  -- feedback/carimbo e reabrir uma sessão concluída).
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    RAISE EXCEPTION 'a nota do treinamento é calculada no servidor: use a RPC complete_training_session'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.feedback IS DISTINCT FROM OLD.feedback THEN
    RAISE EXCEPTION 'o feedback do treinamento é definido no servidor: use a RPC complete_training_session'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'a conclusão do treinamento é definida no servidor: use a RPC complete_training_session'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status IS NOT DISTINCT FROM 'completed'
          OR OLD.status IS NOT DISTINCT FROM 'completed') THEN
    RAISE EXCEPTION 'a conclusão do treinamento é definida no servidor: use a RPC complete_training_session'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.prevent_client_training_score() IS
  'Barra escrita direta de training_sessions.score e o status = completed por papel de cliente; a RPC complete_training_session (definer) e service_role passam.';

DROP TRIGGER IF EXISTS trg_training_sessions_nota_so_por_rpc ON public.training_sessions;
CREATE TRIGGER trg_training_sessions_nota_so_por_rpc
  BEFORE INSERT OR UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_training_score();

-- ============================================================================
-- 4) ACL — negar por padrão; só a RPC é chamável pelo cliente
-- ============================================================================
REVOKE ALL ON FUNCTION public.calculate_training_score(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_client_training_score() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_training_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_training_session(uuid) TO authenticated, service_role;
