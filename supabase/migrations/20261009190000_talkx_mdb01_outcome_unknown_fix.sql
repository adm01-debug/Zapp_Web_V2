-- 20261009190000_talkx_mdb01_outcome_unknown_fix
-- talkx_mdb01_objetos_ausentes
--
-- Corrige talkx_engine_alerts(): a view talkx_engine_health emite
-- kind = 'outcome_unknown_24h', mas o CHECK talkx_alerts_kind_check
-- aceita apenas 'outcome_unknown' (sem o sufixo _24h).
--
-- A signals CTE passava h.kind direto → INSERT violava o CHECK e
-- abortava o lote inteiro, inclusive os outros alertas da rodada
-- (item 33 / R3-DELTA-001). Fix: normalizar no momento da leitura.

CREATE OR REPLACE FUNCTION public.talkx_engine_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_firing   jsonb := '[]'::jsonb;
  v_opened   integer := 0;
  v_resolved integer := 0;
  v_cron_bad boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- Sinais que disparam alerta AGORA (kind de alerta + campanha).
  -- DELTA vs X033: 'outcome_unknown_24h' normalizado para 'outcome_unknown'
  -- (view emite _24h; CHECK da tabela aceita sem sufixo).
  WITH signals AS (
    SELECT CASE WHEN h.kind = 'outcome_unknown_24h' THEN 'outcome_unknown'
                ELSE h.kind
           END AS kind,
           h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind IN ('stalled_campaign', 'outcome_unknown_24h')
    UNION
    SELECT 'stale_lease'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'stale_lease'
    UNION
    SELECT 'high_failure_rate'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'failure_rate_15m'
       AND COALESCE(h.metric_count, 0) >= 5
       AND COALESCE(h.metric_rate, 0) >= 0.5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'campaign_id', s.campaign_id)), '[]'::jsonb)
    INTO v_firing
    FROM signals AS s;

  -- cron_degraded: ultimas 3 execucoes do cron do Talk X todas falhas (ex.: job startup timeout).
  SELECT (count(*) = 3 AND bool_and(r.status = 'failed'))
    INTO v_cron_bad
    FROM (
      SELECT cr.status
        FROM public.talkx_engine_cron_runs(3) AS cr
       ORDER BY cr.start_time DESC NULLS LAST, cr.runid DESC
       LIMIT 3
    ) AS r;
  IF COALESCE(v_cron_bad, false) THEN
    v_firing := v_firing || jsonb_build_array(jsonb_build_object('kind', 'cron_degraded', 'campaign_id', NULL));
  END IF;

  -- 1) abrir alertas novos (dedup pelo indice parcial unico; ON CONFLICT DO NOTHING).
  INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
  SELECT (s ->> 'kind'),
         NULLIF(s ->> 'campaign_id', '')::uuid,
         jsonb_build_object('detected_at', v_now, 'source', 'talkx_engine_health')
    FROM jsonb_array_elements(v_firing) AS s
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- 2) fechar alertas cujo sinal deixou de disparar (fechamento automatico).
  UPDATE public.talkx_alerts AS a
     SET resolved_at = v_now
   WHERE a.resolved_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_firing) AS s
        WHERE (s ->> 'kind') = a.kind
          AND COALESCE(NULLIF(s ->> 'campaign_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(a.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
     );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN jsonb_build_object(
    'opened', v_opened,
    'resolved', v_resolved,
    'firing', v_firing,
    'at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_engine_alerts() TO service_role;

COMMENT ON FUNCTION public.talkx_engine_alerts() IS
  'X033+MDB01: avalia talkx_engine_health e abre/fecha talkx_alerts. Dedup por (tipo, campanha); fecha sozinho o alerta que parou de disparar. outcome_unknown_24h normalizado para outcome_unknown (CHECK). Chamada pelo trigger_talkx_engine_tick a cada 5 min. So service_role.';
