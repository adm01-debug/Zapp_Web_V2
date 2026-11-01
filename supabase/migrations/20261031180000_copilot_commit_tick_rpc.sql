-- CV-052: RPC commit_copilot_tick — sessão + insights em 1 transação
-- Substitui as duas chamadas separadas em copilot-tick.ts (session UPDATE + insights INSERT),
-- eliminando a janela de perda de insights quando o INSERT falha após o cursor já ter avançado.

CREATE OR REPLACE FUNCTION public.commit_copilot_tick(
  p_session_id    uuid,
  p_state_version int,
  p_patch         jsonb,
  p_insights      jsonb  DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Passo 1: atualiza sessão com trava otimista.
  -- Se outro tick gravou antes (state_version mudou), não toca nada e retorna false.
  UPDATE copilot_sessions SET
    state_version               = (p_patch->>'state_version')::int,
    last_tick_at                = (p_patch->>'last_tick_at')::timestamptz,
    last_processed_message_at   = (p_patch->>'last_processed_message_at')::timestamptz,
    sale_stage                  = COALESCE(p_patch->>'sale_stage',               sale_stage),
    temperature                 = COALESCE((p_patch->>'temperature')::int,        temperature),
    intent                      = COALESCE(p_patch->>'intent',                    intent),
    sentiment                   = COALESCE(p_patch->>'sentiment',                 sentiment),
    comm_style                  = COALESCE(p_patch->>'comm_style',                comm_style),
    decision_role               = COALESCE(p_patch->>'decision_role',             decision_role),
    occasion                    = COALESCE(p_patch->>'occasion',                  occasion),
    stakeholders                = COALESCE(p_patch->'stakeholders',               stakeholders),
    brinde_budget               = COALESCE(p_patch->>'brinde_budget',             brinde_budget),
    brinde_responsible          = COALESCE(p_patch->>'brinde_responsible',        brinde_responsible),
    brinde_intention            = COALESCE(p_patch->>'brinde_intention',          brinde_intention),
    brinde_quantity             = COALESCE((p_patch->>'brinde_quantity')::int,     brinde_quantity),
    brinde_deadline             = COALESCE((p_patch->>'brinde_deadline')::date,    brinde_deadline),
    brinde_delivery             = COALESCE(p_patch->>'brinde_delivery',            brinde_delivery),
    brinde_meter                = COALESCE((p_patch->>'brinde_meter')::int,        brinde_meter),
    brinde_evidence             = CASE WHEN p_patch ? 'brinde_evidence'
                                       THEN p_patch->'brinde_evidence'
                                       ELSE brinde_evidence END
  WHERE id = p_session_id AND state_version = p_state_version;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN false;  -- stale: outro tick ganhou a corrida
  END IF;

  -- Passo 2: insere insights na mesma transação.
  -- Se falhar aqui o UPDATE acima é revertido — o cursor não anda e o retry reprocessa tudo.
  IF jsonb_array_length(p_insights) > 0 THEN
    INSERT INTO copilot_insights (
      session_id, profile_id, insight_type, content, source,
      model_version, state_version, tier, latency_ms, data
    )
    SELECT
      (elem->>'session_id')::uuid,
      (elem->>'profile_id')::uuid,
       elem->>'insight_type',
       elem->>'content',
       elem->>'source',
       elem->>'model_version',
      (elem->>'state_version')::int,
      (elem->>'tier')::smallint,
      (elem->>'latency_ms')::int,
      COALESCE(elem->'data', '{}'::jsonb)
    FROM jsonb_array_elements(p_insights) AS elem;
  END IF;

  RETURN true;
END;
$$;

-- Revogar acesso público (função roda SECURITY DEFINER, só edge functions chamam via service_role).
REVOKE EXECUTE ON FUNCTION public.commit_copilot_tick(uuid, int, jsonb, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.commit_copilot_tick(uuid, int, jsonb, jsonb) TO service_role;
