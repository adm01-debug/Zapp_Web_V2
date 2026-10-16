-- xp_ledger_eventos_reais
-- Rollback: remove o livro public.xp_ledger, a rotina interna public.grant_xp_internal e o gatilho de imutabilidade, e devolve as duas funcoes de gatilho ao corpo canonico anterior (closure sem SECURITY DEFINER e sem bloco de XP, de 20261003272707; SLA com o corpo de 20261006211248). O XP ja somado em agent_stats NAO e revertido: o ledger e registro de auditoria por evento, nao fonte de recalculo de pontos.
-- Rollback (SQL executável, na ordem):
--   DROP TRIGGER IF EXISTS xp_ledger_imutavel ON public.xp_ledger;
--   DROP FUNCTION IF EXISTS public.reject_xp_ledger_mutation();
--   CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
--   AS $$
--   BEGIN
--     -- Instante da resposta = quando a mensagem EFETIVAMENTE saiu (status sent),
--     -- nao quando foi criada. O created_at segue como fronteira de ordenacao.
--     PERFORM public.register_first_response_internal(
--       NEW.contact_id,
--       coalesce(NEW.status_updated_at, NEW.created_at),
--       NEW.created_at
--     );
--     RETURN NULL;
--   END;
--   $$;
--   CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
--    RETURNS trigger
--    LANGUAGE plpgsql
--   AS $function$
--   DECLARE
--     v_resolved  bigint;   -- era int (mudado para consistência com agent_stats.conversations_resolved)
--   BEGIN
--     -- Para UPDATE: só contar quando closed_by muda de NULL para NOT NULL
--     IF TG_OP = 'UPDATE' AND (OLD.closed_by IS NOT NULL OR NEW.closed_by IS NULL) THEN
--       RETURN NEW;
--     END IF;
--     IF NEW.closed_by IS NOT NULL THEN
--       INSERT INTO public.agent_stats (
--         profile_id, messages_sent, messages_received,
--         conversations_resolved, current_streak, best_streak, updated_at
--       )
--       VALUES (NEW.closed_by, 0, 0, 1, 0, 0, now())
--       ON CONFLICT (profile_id) DO UPDATE
--       SET conversations_resolved = public.agent_stats.conversations_resolved + 1,
--           updated_at              = now()
--       RETURNING conversations_resolved INTO v_resolved;
--       IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
--         PERFORM public.grant_agent_achievement(
--           NEW.closed_by,
--           'resolution_milestone',
--           v_resolved || ' Conversas Encerradas',
--           'Você encerrou ' || v_resolved || ' conversas!',
--           LEAST(100, v_resolved)
--         );
--       END IF;
--     END IF;
--     RETURN NEW;
--   EXCEPTION WHEN OTHERS THEN
--     -- Gamificação NUNCA pode reverter fechamento de conversa
--     RAISE WARNING 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]',
--       NEW.id, SQLERRM, SQLSTATE;
--     RETURN NEW;
--   END;
--   $function$;
--   DROP FUNCTION IF EXISTS public.grant_xp_internal(uuid, integer, text, uuid);
--   DROP TABLE IF EXISTS public.xp_ledger;
--
-- PROBLEMA (cartão t_c09e53ad)
-- Hoje o XP só existe como número agregado em agent_stats.xp: não há registro de
-- POR QUE um ponto foi dado, então não se audita a pontuação e nada impede que o
-- MESMO evento (retry de webhook de status, reenvio, reabertura de conversa)
-- conceda XP duas vezes.
--
-- CORREÇÃO
--   1) public.xp_ledger: livro-razão imutável (amount, reason, ref_id) com índice
--      único (reason, ref_id) — a chave de idempotência é o EVENTO de origem, não
--      a chamada. RLS: agente lê só o próprio livro, admin/supervisor lê tudo;
--      nenhum papel de cliente pode INSERT/UPDATE/DELETE (ACL + gatilho de
--      imutabilidade contra UPDATE/DELETE para todo mundo).
--   2) public.grant_xp_internal(profile_id, amount, reason, ref_id): rotina
--      interna SECURITY DEFINER, EXECUTE só no servidor (revogado de PUBLIC,
--      anon, authenticated e service_role). Grava no ledger e soma em
--      agent_stats.xp com a MESMA rotina atômica já usada pelo XP do projeto:
--      linha travada com FOR UPDATE, mesmo cálculo de level, mesmo cap de 500
--      por chamada. Evento repetido devolve {granted:false, duplicate:true} sem
--      tocar em agent_stats.
--   3) Os dois gatilhos EXISTENTES passam a conceder (não há RPC nova para o
--      cliente; o XP nasce sempre do evento real no servidor):
--        +20 XP  ao encerrar conversa  (reason 'conversation_closed',
--                ref_id = conversation_closures.id → 1x por closure);
--        +10 XP  na PRIMEIRA resposta dentro do SLA (reason
--                'first_response_in_sla', ref_id = conversation_sla.id → 1x por
--                conversa; o prazo vem de conversation_sla.first_response_breached,
--                a mesma marca que o SLA já grava — nada de recriar a regra).
--      Falha de gamificação continua NUNCA derrubando o envio da mensagem nem o
--      encerramento da conversa (o padrão de 20261006221628 é preservado).
--
-- ESCOPO / EFEITOS COLATERAIS
--   - Sem backfill: o XP antigo não é recalculado e o ledger começa vazio. Por
--     construção SUM(xp_ledger.amount) < agent_stats.xp para quem já pontuou por
--     marcos/conquistas — o ledger cobre só os dois eventos novos.
--   - Nenhum GRANT/REVOKE de objeto existente muda; o único ajuste de postura é
--     handle_conversation_closure_gamification virar SECURITY DEFINER, e só
--     porque a rotina interna é fechada ao papel authenticated com que aquele
--     gatilho rodava (corpo e tratamento de exceção inalterados).
--   - xp_ledger ENABLE ROW LEVEL SECURITY (sem FORCE): o dono postgres grava
--     pela rotina SECURITY DEFINER, o cliente passa por RLS.

SET search_path = public, pg_temp;

-- ============================================================================
-- 1) Livro-razão de XP
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL,
  reason     text NOT NULL,
  ref_id     uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_ledger_amount_positivo CHECK (amount > 0),
  CONSTRAINT xp_ledger_reason_nao_vazio CHECK (length(btrim(reason)) > 0)
);

-- idempotência: um evento de origem, no máximo um lançamento
CREATE UNIQUE INDEX IF NOT EXISTS xp_ledger_reason_ref_uidx
  ON public.xp_ledger (reason, ref_id);
CREATE INDEX IF NOT EXISTS xp_ledger_profile_created_idx
  ON public.xp_ledger (profile_id, created_at DESC);

ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

-- livro-razão: ninguém edita nem apaga um lançamento
CREATE OR REPLACE FUNCTION public.reject_xp_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'xp_ledger é um livro imutável: % não é permitido', TG_OP;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_xp_ledger_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS xp_ledger_imutavel ON public.xp_ledger;
CREATE TRIGGER xp_ledger_imutavel
  BEFORE UPDATE OR DELETE ON public.xp_ledger
  FOR EACH ROW EXECUTE FUNCTION public.reject_xp_ledger_mutation();

-- ACL: cliente só LÊ (o que a policy deixar); nada de DML
REVOKE ALL ON TABLE public.xp_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.xp_ledger FROM authenticated;
GRANT SELECT ON TABLE public.xp_ledger TO authenticated;

DROP POLICY IF EXISTS "Agente lê o próprio livro de XP" ON public.xp_ledger;
CREATE POLICY "Agente lê o próprio livro de XP" ON public.xp_ledger
  FOR SELECT TO authenticated
  USING (profile_id = public.get_profile_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Admin ou supervisor lê o livro de XP" ON public.xp_ledger;
CREATE POLICY "Admin ou supervisor lê o livro de XP" ON public.xp_ledger
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ============================================================================
-- 2) Rotina interna que concede XP (nunca exposta ao cliente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_xp_internal(
  p_profile_id uuid,
  p_amount     integer,
  p_reason     text,
  p_ref_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row       public.agent_stats%ROWTYPE;
  v_ledger_id uuid;
  v_new_xp    bigint;
  v_new_level int;
BEGIN
  IF p_profile_id IS NULL OR p_ref_id IS NULL THEN
    RAISE EXCEPTION 'grant_xp_internal: profile_id e ref_id são obrigatórios';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'grant_xp_internal: amount deve estar entre 1 e 500, recebido %', p_amount;
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'grant_xp_internal: reason é obrigatória';
  END IF;

  -- mesma rotina atômica do XP do projeto: linha travada, level recalculado
  SELECT * INTO v_row FROM public.agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', p_reason, 'noStats', true);
  END IF;

  -- evento repetido: o índice único barra e NADA é somado
  INSERT INTO public.xp_ledger (profile_id, amount, reason, ref_id)
  VALUES (p_profile_id, p_amount, p_reason, p_ref_id)
  ON CONFLICT (reason, ref_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', p_reason, 'duplicate', true);
  END IF;

  v_new_xp    := COALESCE(v_row.xp, 0) + p_amount;
  -- mesmo cálculo de level do projeto (calculate_level já é o usado pelo
  -- gatilho on_agent_stats_update_level)
  v_new_level := public.calculate_level(v_new_xp);

  UPDATE public.agent_stats
     SET xp = v_new_xp,
         level = v_new_level,
         updated_at = now()
   WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'granted', true, 'reason', p_reason, 'amount', p_amount,
    'newXp', v_new_xp, 'newLevel', v_new_level,
    'previousLevel', v_row.level, 'leveledUp', v_new_level > v_row.level
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_xp_internal(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 3) Gatilho existente: +20 XP por conversa encerrada (1x por closure)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_resolved  int;   -- int como em 20260927470000: o marco so usa valores pequenos
BEGIN
  -- Para UPDATE: só contar quando closed_by muda de NULL para NOT NULL
  IF TG_OP = 'UPDATE' AND (OLD.closed_by IS NOT NULL OR NEW.closed_by IS NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.closed_by IS NOT NULL THEN
    INSERT INTO public.agent_stats (
      profile_id, messages_sent, messages_received,
      conversations_resolved, current_streak, best_streak, updated_at
    )
    VALUES (NEW.closed_by, 0, 0, 1, 0, 0, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET conversations_resolved = public.agent_stats.conversations_resolved + 1,
        updated_at              = now()
    RETURNING conversations_resolved INTO v_resolved;

    -- v_resolved e int (como em 20260927470000): com bigint o LEAST resolvia para
    -- bigint e a chamada a grant_agent_achievement(integer) estourava 42883, e o
    -- EXCEPTION do fim desfazia TUDO (contador e +20) em toda closure de marco.
    -- Com int o LEAST resolve para integer e chama a assinatura existente direto.
    IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
      PERFORM public.grant_agent_achievement(
        NEW.closed_by,
        'resolution_milestone',
        v_resolved || ' Conversas Encerradas',
        'Você encerrou ' || v_resolved || ' conversas!',
        LEAST(100, v_resolved)
      );
    END IF;

    -- +20 XP por conversa encerrada; ref_id = a própria closure garante 1x por ciclo
    PERFORM public.grant_xp_internal(NEW.closed_by, 20, 'conversation_closed', NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificação NUNCA pode reverter fechamento de conversa
  RAISE WARNING 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 4) Gatilho existente: +10 XP na primeira resposta dentro do SLA (1x por conversa)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_responded_at timestamptz;
  v_sla_id       uuid;
BEGIN
  -- Instante da resposta = quando a mensagem EFETIVAMENTE saiu (status sent),
  -- nao quando foi criada. O created_at segue como fronteira de ordenacao.
  v_responded_at := coalesce(NEW.status_updated_at, NEW.created_at);

  PERFORM public.register_first_response_internal(
    NEW.contact_id,
    v_responded_at,
    NEW.created_at
  );

  -- XP pela primeira resposta dentro do SLA. Isolado em bloco proprio: falha de
  -- gamificacao nao pode derrubar o envio da mensagem.
  BEGIN
    IF NEW.agent_id IS NOT NULL THEN
      SELECT s.id INTO v_sla_id
        FROM public.conversation_sla AS s
       WHERE s.contact_id = NEW.contact_id
         AND s.first_response_at = v_responded_at
         AND s.first_response_breached IS FALSE
       ORDER BY s.id
       LIMIT 1;

      IF v_sla_id IS NOT NULL THEN
        PERFORM public.grant_xp_internal(NEW.agent_id, 10, 'first_response_in_sla', v_sla_id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'gamification error in messages_sla_first_response_trigger (message_id=%): % [%]',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NULL;
END;
$$;
