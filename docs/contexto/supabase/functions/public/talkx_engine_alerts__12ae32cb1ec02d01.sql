CREATE OR REPLACE FUNCTION public.talkx_engine_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now                 timestamptz := now();
  v_firing              jsonb := '[]'::jsonb;
  v_opened              integer := 0;
  v_resolved            integer := 0;
  v_cron_bad            boolean := false;
  v_cron_reason         text;
  v_cron_consec         integer := 0;
  v_cron_timeouts       integer := 0;
  v_cron_last_msg       text;
  v_cron_timeout_latest boolean := false;
  v_cron_already_open   boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  WITH signals AS (
    SELECT CASE WHEN h.kind = 'outcome_unknown_24h' THEN 'outcome_unknown' ELSE h.kind END AS kind,
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

  WITH last10 AS (
    SELECT cr.status, cr.return_message,
           row_number() OVER (ORDER BY cr.start_time DESC NULLS LAST, cr.runid DESC) AS rn
      FROM public.talkx_engine_cron_runs(10) AS cr
  )
  SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE COALESCE(min(l.rn) FILTER (WHERE l.status IS DISTINCT FROM 'failed'),
                            count(*) + 1) - 1
         END,
         count(*) FILTER (WHERE l.return_message ILIKE '%job startup timeout%'),
         max(l.return_message) FILTER (WHERE l.rn = 1),
         COALESCE(bool_or(l.rn = 1 AND l.status = 'failed'
                          AND l.return_message ILIKE '%job startup timeout%'), false)
    INTO v_cron_consec, v_cron_timeouts, v_cron_last_msg, v_cron_timeout_latest
    FROM last10 AS l;

  IF v_cron_timeout_latest THEN
    v_cron_bad := true;
    v_cron_reason := 'timeout';
  ELSIF v_cron_consec >= 5 THEN
    v_cron_bad := true;
    v_cron_reason := 'consecutive_failures';
  END IF;

  IF v_cron_bad THEN
    v_firing := v_firing || jsonb_build_array(jsonb_build_object('kind', 'cron_degraded', 'campaign_id', NULL));
  END IF;

  INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
  SELECT (s ->> 'kind'),
         NULLIF(s ->> 'campaign_id', '')::uuid,
         jsonb_build_object('detected_at', v_now, 'source', 'talkx_engine_health')
    FROM jsonb_array_elements(v_firing) AS s
   WHERE (s ->> 'kind') <> 'cron_degraded'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  IF v_cron_bad THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.talkx_alerts AS a
       WHERE a.kind = 'cron_degraded'
         AND a.resolved_at IS NULL
    ) INTO v_cron_already_open;

    INSERT INTO public.talkx_alerts AS alert (kind, campaign_id, payload)
    VALUES ('cron_degraded', NULL, jsonb_build_object(
      'detected_at', v_now,
      'source', 'talkx_engine_health',
      'reason', v_cron_reason,
      'consecutive_failures', v_cron_consec,
      'timeouts', v_cron_timeouts,
      'last_return_message', left(v_cron_last_msg, 200)
    ))
    ON CONFLICT (kind, (COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      WHERE resolved_at IS NULL
    DO UPDATE SET payload = alert.payload || jsonb_build_object(
      'reason', EXCLUDED.payload -> 'reason',
      'consecutive_failures', EXCLUDED.payload -> 'consecutive_failures',
      'timeouts', EXCLUDED.payload -> 'timeouts',
      'last_return_message', EXCLUDED.payload -> 'last_return_message'
    );

    IF NOT v_cron_already_open THEN
      v_opened := v_opened + 1;
    END IF;
  END IF;

  UPDATE public.talkx_alerts AS a
     SET resolved_at = v_now
   WHERE a.resolved_at IS NULL
     AND a.kind <> 'purge_failed'
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
$function$
