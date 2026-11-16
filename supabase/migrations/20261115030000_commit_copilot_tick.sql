-- O tick do Copiloto grava em DUAS chamadas separadas:
--   supabase/functions/_shared/copilot-tick.ts:514 — UPDATE em copilot_sessions
--     (trava otimista em state_version), e
--   supabase/functions/_shared/copilot-tick.ts:531 — INSERT em copilot_insights.
-- Se o INSERT falha (rede, RLS, coluna, timeout), o cursor da sessão JÁ andou:
-- state_version subiu e last_processed_message_at avançou. As mensagens
-- analisadas não voltam ao próximo tick, então a análise que o provedor pago
-- devolveu é perdida em silêncio e o vendedor nunca vê aquele insight.
--
-- Esta função faz as duas escritas na MESMA transação: ou a sessão anda com os
-- insights gravados, ou nada acontece e o próximo tick reprocessa.
--
-- Contrato:
--   -1  → a trava otimista barrou (outro tick gravou antes) ou a sessão não
--         existe; NADA foi escrito e o chamador devolve `skipped: stale_state`.
--   >=0 → número de insights gravados; a sessão está em p_state_version + 1.
--
-- Decisões de segurança:
--   * SECURITY INVOKER: a função não contorna RLS. Quem chama é a edge com
--     service_role (BYPASSRLS); EXECUTE é revogado de PUBLIC para que um
--     usuário logado não mova o cursor de sessão alguma.
--   * O patch entra por jsonb_populate_record (tipos da própria tabela) e as
--     chaves são conferidas contra uma lista fixa: chave fora da lista é ERRO,
--     não é ignorada em silêncio (que é o comportamento padrão da função) nem
--     vira SQL dinâmico. id/conversation_id/contact_id/profile_id não são
--     alteráveis por aqui.
--   * session_id, profile_id e state_version dos insights vêm da sessão e do
--     contador novo, não do payload: insight não pode cair em outra sessão nem
--     carimbar versão errada.
--
-- NÃO há mudança de comportamento em produção enquanto nenhuma edge chamar a
-- função: ela nasce sem chamador. A troca em copilot-tick.ts é o passo 2, numa
-- PR própria, DEPOIS que este DDL estiver aplicado (ordem do docs/agentes/banco.md:
-- arquivo → PR → merge → deploy → apply; aqui o apply vem antes do código que usa).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.commit_copilot_tick(uuid, integer, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.commit_copilot_tick(
  p_session_id    uuid,
  p_state_version integer,
  p_patch         jsonb,
  p_insights      jsonb DEFAULT '[]'::jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Exatamente as colunas que buildSessionPatch monta (copilot-tick.ts:197-227).
  colunas_permitidas text[] := ARRAY[
    'state_version', 'last_tick_at', 'last_processed_message_at',
    'sale_stage', 'temperature', 'intent', 'sentiment', 'comm_style',
    'occasion', 'decision_role', 'stakeholders',
    'brinde_budget', 'brinde_responsible', 'brinde_intention',
    'brinde_quantity', 'brinde_deadline', 'brinde_delivery',
    'brinde_meter', 'brinde_evidence'
  ];
  desconhecidas text;
  linha  public.copilot_sessions;
  gravou uuid;
  n_insights integer := 0;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'commit_copilot_tick: p_patch tem de ser um objeto jsonb';
  END IF;

  SELECT string_agg(chave, ', ' ORDER BY chave) INTO desconhecidas
  FROM jsonb_object_keys(p_patch) AS chave
  WHERE chave <> ALL (colunas_permitidas);
  IF desconhecidas IS NOT NULL THEN
    RAISE EXCEPTION 'commit_copilot_tick: campo nao permitido no patch: %', desconhecidas;
  END IF;

  -- FOR UPDATE serializa dois ticks da mesma sessão: o segundo espera e então
  -- vê o state_version novo, devolvendo -1 em vez de gravar em cima.
  SELECT * INTO linha FROM public.copilot_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR linha.state_version <> p_state_version THEN
    RETURN -1;
  END IF;

  linha := jsonb_populate_record(linha, p_patch);

  UPDATE public.copilot_sessions SET
    state_version             = linha.state_version,
    last_tick_at              = linha.last_tick_at,
    last_processed_message_at = linha.last_processed_message_at,
    sale_stage                = linha.sale_stage,
    temperature               = linha.temperature,
    intent                    = linha.intent,
    sentiment                 = linha.sentiment,
    comm_style                = linha.comm_style,
    occasion                  = linha.occasion,
    decision_role             = linha.decision_role,
    stakeholders              = linha.stakeholders,
    brinde_budget             = linha.brinde_budget,
    brinde_responsible        = linha.brinde_responsible,
    brinde_intention          = linha.brinde_intention,
    brinde_quantity           = linha.brinde_quantity,
    brinde_deadline           = linha.brinde_deadline,
    brinde_delivery           = linha.brinde_delivery,
    brinde_meter              = linha.brinde_meter,
    brinde_evidence           = linha.brinde_evidence
  WHERE id = p_session_id AND state_version = p_state_version
  RETURNING id INTO gravou;
  IF gravou IS NULL THEN
    RETURN -1;
  END IF;

  IF p_insights IS NOT NULL AND jsonb_typeof(p_insights) = 'array'
     AND jsonb_array_length(p_insights) > 0 THEN
    INSERT INTO public.copilot_insights
      (session_id, profile_id, insight_type, content, source,
       model_version, state_version, tier, latency_ms, data)
    SELECT
      p_session_id,
      linha.profile_id,
      i.insight_type,
      i.content,
      coalesce(i.source, 'edge'),
      i.model_version,
      p_state_version + 1,
      i.tier,
      i.latency_ms,
      i.data
    FROM jsonb_populate_recordset(NULL::public.copilot_insights, p_insights) AS i;
    n_insights := jsonb_array_length(p_insights);
  END IF;

  RETURN n_insights;
END;
$$;

COMMENT ON FUNCTION public.commit_copilot_tick(uuid, integer, jsonb, jsonb) IS
  'Fecha um tick do Copiloto: UPDATE da sessao (trava otimista em state_version) + INSERT dos insights na MESMA transacao. -1 = trava barrou e nada foi escrito.';

-- Só a edge (service_role) fecha tick. Sem isto, qualquer usuario logado
-- poderia mover o cursor de uma sessao via PostgREST.
REVOKE ALL ON FUNCTION public.commit_copilot_tick(uuid, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_copilot_tick(uuid, integer, jsonb, jsonb) TO service_role;
