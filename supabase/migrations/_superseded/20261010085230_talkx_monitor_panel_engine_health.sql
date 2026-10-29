-- talkx_monitor_panel: bloco de saude do motor (motor health) lido de talkx_engine_health
-- versão 20261010085230 reservada para hermes-talkx-monitor-panel-engine-health-261010085230
-- Rollback:
--   drop function if exists public.talkx_monitor_panel(uuid, integer, text, date, uuid);
--   create or replace function public.talkx_monitor_panel(
--     p_campaign_id    uuid,
--     p_window_minutes integer DEFAULT 60,
--     p_bucket         text    DEFAULT 'minute',
--     p_day            date    DEFAULT NULL,
--     p_segment_id     uuid    DEFAULT NULL
--   )
--   returns jsonb
--   language plpgsql
--   stable
--   security definer
--   set search_path = public, pg_temp
--   as $fn$
--   declare
--     v_uid        uuid := auth.uid();
--     v_now        timestamptz := now();
--     v_camp       public.talkx_campaigns%rowtype;
--     v_tz         text;
--     v_step       interval;
--     v_first      timestamptz;
--     v_last       timestamptz;
--     v_today      timestamptz;
--     v_yesterday  timestamptz;
--     v_threshold  interval;
--     v_conn       text;
--     v_sent integer; v_delivered integer; v_replied integer; v_failed integer;
--     v_unknown integer; v_skipped integer; v_remaining integer; v_total integer;
--     v_processed integer; v_old_sent integer; v_old_delivered integer; v_recent_sent integer;
--     v_peak_now integer; v_peak_prev integer;
--     v_replied_today integer; v_replied_yday integer; v_failed_today integer; v_failed_yday integer;
--     v_sent_yday integer;
--     v_last_activity timestamptz;
--     v_optouts    integer;
--     v_state      text;
--     v_reco       text;
--     v_series     jsonb;
--     v_spark      jsonb;
--   begin
--     if v_uid is null then raise exception 'acesso negado' using errcode = '42501'; end if;
--     if p_bucket is null or p_bucket not in ('minute', 'hour') then raise exception 'p_bucket deve ser minute ou hour' using errcode = '22023'; end if;
--     if p_window_minutes is null or p_window_minutes not between 1 and 10080 then raise exception 'p_window_minutes deve estar entre 1 e 10080' using errcode = '22023'; end if;
--     select * into v_camp from public.talkx_campaigns where id = p_campaign_id;
--     if not found or not (v_camp.created_by = (select id from public.profiles where user_id = v_uid limit 1) or public.is_admin_or_supervisor(v_uid)) then raise exception 'acesso negado' using errcode = '42501'; end if;
--     v_tz := coalesce(v_camp.schedule_timezone, 'America/Sao_Paulo');
--     if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'America/Sao_Paulo'; end if;
--     v_step := case p_bucket when 'hour' then interval '1 hour' else interval '1 minute' end;
--     v_today := date_trunc('day', v_now, v_tz);
--     v_yesterday := date_trunc('day', v_today - interval '12 hours', v_tz);
--     if p_day is not null then v_first := date_trunc(p_bucket, p_day::timestamp at time zone v_tz, v_tz); v_last := date_trunc(p_bucket, least(((p_day + 1)::timestamp at time zone v_tz) - interval '1 microsecond', v_now), v_tz);
--     else v_last := date_trunc(p_bucket, v_now, v_tz); v_first := v_last - v_step * (ceil(p_window_minutes::numeric / case p_bucket when 'hour' then 60 else 1 end)::integer - 1); end if;
--     select count(*) filter (where sent_at is not null), count(*) filter (where delivered_at is not null), count(*) filter (where replied_at is not null), count(*) filter (where status = 'failed'), count(*) filter (where status = 'outcome_unknown'), count(*) filter (where status = 'skipped'), count(*) filter (where status in ('pending', 'sending')), count(*), count(*) filter (where sent_at is not null or status = 'failed'), count(*) filter (where sent_at < v_now - interval '10 minutes'), count(*) filter (where sent_at < v_now - interval '10 minutes' and delivered_at is not null), count(*) filter (where sent_at >= v_now - interval '5 minutes'), count(*) filter (where replied_at >= v_now - interval '10 minutes'), count(*) filter (where replied_at >= v_now - interval '20 minutes' and replied_at < v_now - interval '10 minutes'), count(*) filter (where replied_at >= v_today), count(*) filter (where replied_at >= v_yesterday and replied_at < v_today), count(*) filter (where failed_at >= v_today), count(*) filter (where failed_at >= v_yesterday and failed_at < v_today), count(*) filter (where sent_at >= v_yesterday and sent_at < v_today), greatest(max(sent_at), max(delivery_claimed_at)) into v_sent, v_delivered, v_replied, v_failed, v_unknown, v_skipped, v_remaining, v_total, v_processed, v_old_sent, v_old_delivered, v_recent_sent, v_peak_now, v_peak_prev, v_replied_today, v_replied_yday, v_failed_today, v_failed_yday, v_sent_yday, v_last_activity from public.talkx_recipients where campaign_id = p_campaign_id and (p_segment_id is null or segment_id = p_segment_id);
--     select count(*) into v_optouts from public.talkx_blacklist where campaign_id = p_campaign_id and origin = 'optout';
--     with r as (select sent_at, delivered_at, replied_at, failed_at from public.talkx_recipients where campaign_id = p_campaign_id and (p_segment_id is null or segment_id = p_segment_id)), ev as (select 's' as k, date_trunc(p_bucket, sent_at, v_tz) as b from r where sent_at >= v_first and sent_at < v_last + v_step union all select 'd', date_trunc(p_bucket, delivered_at, v_tz) from r where delivered_at >= v_first and delivered_at < v_last + v_step union all select 'r', date_trunc(p_bucket, replied_at, v_tz) from r where replied_at >= v_first and replied_at < v_last + v_step union all select 'f', date_trunc(p_bucket, failed_at, v_tz) from r where failed_at >= v_first and failed_at < v_last + v_step), cnt as (select b, count(*) filter (where k = 's') as s, count(*) filter (where k = 'd') as d, count(*) filter (where k = 'r') as r, count(*) filter (where k = 'f') as f from ev group by b) select coalesce(jsonb_agg(jsonb_build_object('t', g.t, 'sent', coalesce(c.s, 0), 'delivered', coalesce(c.d, 0), 'replied', coalesce(c.r, 0), 'failed', coalesce(c.f, 0)) order by g.t), '[]'::jsonb) into v_series from generate_series(v_first, v_last, v_step) as g(t) left join cnt c on c.b = g.t;
--     select jsonb_build_object('sent', jsonb_agg(x.s order by x.i), 'delivered', jsonb_agg(x.d order by x.i), 'replied', jsonb_agg(x.r order by x.i), 'failed', jsonb_agg(x.f order by x.i)) into v_spark from (select i, (select count(*) from public.talkx_recipients t where t.campaign_id = p_campaign_id and (p_segment_id is null or t.segment_id = p_segment_id) and t.sent_at >= v_now - make_interval(mins => (12 - i) * 5) and t.sent_at < v_now - make_interval(mins => (11 - i) * 5)) as s, (select count(*) from public.talkx_recipients t where t.campaign_id = p_campaign_id and (p_segment_id is null or t.segment_id = p_segment_id) and t.delivered_at >= v_now - make_interval(mins => (12 - i) * 5) and t.delivered_at < v_now - make_interval(mins => (11 - i) * 5)) as d, (select count(*) from public.talkx_recipients t where t.campaign_id = p_campaign_id and (p_segment_id is null or t.segment_id = p_segment_id) and t.replied_at >= v_now - make_interval(mins => (12 - i) * 5) and t.replied_at < v_now - make_interval(mins => (11 - i) * 5)) as r, (select count(*) from public.talkx_recipients t where t.campaign_id = p_campaign_id and (p_segment_id is null or t.segment_id = p_segment_id) and t.failed_at >= v_now - make_interval(mins => (12 - i) * 5) and t.failed_at < v_now - make_interval(mins => (11 - i) * 5)) as f from generate_series(0, 11) as i) as x;
--     v_threshold := make_interval(secs => greatest(180, 3 * (v_camp.send_interval_max + v_camp.typing_delay_max) / 1000.0));
--     v_last_activity := greatest(v_last_activity, v_camp.started_at, v_camp.updated_at);
--     if v_camp.whatsapp_connection_id is not null then select status into v_conn from public.whatsapp_connections where id = v_camp.whatsapp_connection_id; end if;
--     v_state := case when v_camp.status = 'sending' and v_remaining > 0 and v_last_activity < v_now - v_threshold then 'stalled' when v_camp.status = 'sending' then 'sending' when v_camp.status = 'paused' and coalesce(v_camp.pause_reason, 'manual') = 'manual' then 'paused_manual' when v_camp.status = 'paused' then 'paused_auto' when v_camp.status in ('completed', 'cancelled') then 'done' else 'idle' end;
--     v_reco := case when v_state in ('sending', 'stalled', 'paused_auto') and v_camp.whatsapp_connection_id is not null and v_conn is distinct from 'connected' then 'connection_down' when v_state = 'stalled' then 'stalled' when v_processed >= 50 and v_failed::numeric / v_processed > 0.05 then 'high_failure' when v_total > 0 and v_optouts::numeric / v_total > 0.02 then 'optout_spike' when v_old_sent >= 50 and v_old_delivered::numeric / v_old_sent < 0.8 then 'low_delivery' else 'ok' end;
--     return jsonb_build_object('kpis', jsonb_build_object('sent', v_sent, 'delivered', v_delivered, 'replied', v_replied, 'failed', v_failed, 'optouts', v_optouts, 'to_confirm', v_unknown, 'skipped', v_skipped, 'remaining', v_remaining, 'total', v_total, 'delivery_rate_pct', case when v_sent > 0 then round(100.0 * v_delivered / v_sent, 1) end, 'optout_rate_pct', case when v_total > 0 then round(100.0 * v_optouts / v_total, 1) end), 'vs_yesterday', case when v_sent_yday > 0 then jsonb_build_object('replied', jsonb_build_object('today', v_replied_today, 'yesterday', v_replied_yday), 'failed', jsonb_build_object('today', v_failed_today, 'yesterday', v_failed_yday)) end, 'forecast', jsonb_build_object('per_minute', null, 'pct_vs_forecast', null, 'estimated_end', null), 'spark', v_spark, 'series', v_series, 'reply_peak', jsonb_build_object('last_10_min', v_peak_now, 'previous_10_min', v_peak_prev), 'health', jsonb_build_object('worker_state', v_state, 'pause_reason', case when v_state = 'paused_auto' then v_camp.pause_reason end, 'last_activity_at', v_last_activity, 'rate_per_minute', round(v_recent_sent / 5.0, 1), 'recommendation_code', v_reco));
--   end;
--   $fn$;
--   revoke all on function public.talkx_monitor_panel(uuid, integer, text, date, uuid) from public, anon;
--   grant execute on function public.talkx_monitor_panel(uuid, integer, text, date, uuid) to authenticated;
--
-- N-117 (Fase 11 · monitor): adiciona o bloco 'motor' à saude do talkx_monitor_panel,
-- lendo dados de public.talkx_engine_health (security_invoker). O bloco inclui:
--   stalled_campaign, stale_lease, outcome_unknown_24h, failure_rate_15m, cron_status.
-- Autoriza dono da campanha ou admin/supervisor; campanha inexistente e campanha alheia
-- respondem igual (42501), para nao revelar quais ids existem. Somente leitura.

CREATE OR REPLACE FUNCTION public.talkx_monitor_panel(
  p_campaign_id    uuid,
  p_window_minutes integer DEFAULT 60,
  p_bucket         text    DEFAULT 'minute',
  p_day            date    DEFAULT NULL,
  p_segment_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_now        timestamptz := now();
  v_camp       public.talkx_campaigns%ROWTYPE;
  v_tz         text;
  v_step       interval;
  v_first      timestamptz;
  v_last       timestamptz;
  v_today      timestamptz;
  v_yesterday  timestamptz;
  v_threshold  interval;
  v_conn       text;
  v_sent integer; v_delivered integer; v_replied integer; v_failed integer;
  v_unknown integer; v_skipped integer; v_remaining integer; v_total integer;
  v_processed integer; v_old_sent integer; v_old_delivered integer; v_recent_sent integer;
  v_peak_now integer; v_peak_prev integer;
  v_replied_today integer; v_replied_yday integer; v_failed_today integer; v_failed_yday integer;
  v_sent_yday integer;
  v_last_activity timestamptz;
  v_optouts    integer;
  v_state      text;
  v_reco       text;
  v_series     jsonb;
  v_spark      jsonb;
  v_motor      jsonb;
BEGIN
  -- Autenticacao e autorizacao (mesma regra do X140: dono ou admin/supervisor).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_bucket IS NULL OR p_bucket NOT IN ('minute', 'hour') THEN
    RAISE EXCEPTION 'p_bucket deve ser minute ou hour' USING ERRCODE = '22023';
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes NOT BETWEEN 1 AND 10080 THEN
    RAISE EXCEPTION 'p_window_minutes deve estar entre 1 e 10080' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_camp FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR NOT (
       v_camp.created_by = (SELECT id FROM public.profiles WHERE user_id = v_uid LIMIT 1)
       OR public.is_admin_or_supervisor(v_uid)
     ) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  v_tz := COALESCE(v_camp.schedule_timezone, 'America/Sao_Paulo');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'America/Sao_Paulo';
  END IF;
  v_step      := CASE p_bucket WHEN 'hour' THEN interval '1 hour' ELSE interval '1 minute' END;
  v_today     := date_trunc('day', v_now, v_tz);
  v_yesterday := date_trunc('day', v_today - interval '12 hours', v_tz);

  IF p_day IS NOT NULL THEN
    v_first := date_trunc(p_bucket, p_day::timestamp AT TIME ZONE v_tz, v_tz);
    v_last  := date_trunc(p_bucket,
                 LEAST(((p_day + 1)::timestamp AT TIME ZONE v_tz) - interval '1 microsecond', v_now), v_tz);
  ELSE
    v_last  := date_trunc(p_bucket, v_now, v_tz);
    v_first := v_last - v_step * (CEIL(p_window_minutes::numeric
                 / CASE p_bucket WHEN 'hour' THEN 60 ELSE 1 END)::integer - 1);
  END IF;

  SELECT count(*) FILTER (WHERE sent_at IS NOT NULL),
         count(*) FILTER (WHERE delivered_at IS NOT NULL),
         count(*) FILTER (WHERE replied_at IS NOT NULL),
         count(*) FILTER (WHERE status = 'failed'),
         count(*) FILTER (WHERE status = 'outcome_unknown'),
         count(*) FILTER (WHERE status = 'skipped'),
         count(*) FILTER (WHERE status IN ('pending', 'sending')),
         count(*),
         count(*) FILTER (WHERE sent_at IS NOT NULL OR status = 'failed'),
         count(*) FILTER (WHERE sent_at < v_now - interval '10 minutes'),
         count(*) FILTER (WHERE sent_at < v_now - interval '10 minutes' AND delivered_at IS NOT NULL),
         count(*) FILTER (WHERE sent_at >= v_now - interval '5 minutes'),
         count(*) FILTER (WHERE replied_at >= v_now - interval '10 minutes'),
         count(*) FILTER (WHERE replied_at >= v_now - interval '20 minutes'
                            AND replied_at < v_now - interval '10 minutes'),
         count(*) FILTER (WHERE replied_at >= v_today),
         count(*) FILTER (WHERE replied_at >= v_yesterday AND replied_at < v_today),
         count(*) FILTER (WHERE failed_at >= v_today),
         count(*) FILTER (WHERE failed_at >= v_yesterday AND failed_at < v_today),
         count(*) FILTER (WHERE sent_at >= v_yesterday AND sent_at < v_today),
         GREATEST(max(sent_at), max(delivery_claimed_at))
    INTO v_sent, v_delivered, v_replied, v_failed, v_unknown, v_skipped, v_remaining, v_total,
         v_processed, v_old_sent, v_old_delivered, v_recent_sent, v_peak_now, v_peak_prev,
         v_replied_today, v_replied_yday, v_failed_today, v_failed_yday, v_sent_yday,
         v_last_activity
    FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id
     AND (p_segment_id IS NULL OR segment_id = p_segment_id);

  SELECT count(*) INTO v_optouts
    FROM public.talkx_blacklist
   WHERE campaign_id = p_campaign_id AND origin = 'optout';

  WITH r AS (
    SELECT sent_at, delivered_at, replied_at, failed_at
      FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND (p_segment_id IS NULL OR segment_id = p_segment_id)
  ), ev AS (
    SELECT 's' AS k, date_trunc(p_bucket, sent_at, v_tz) AS b FROM r
     WHERE sent_at >= v_first AND sent_at < v_last + v_step
    UNION ALL
    SELECT 'd', date_trunc(p_bucket, delivered_at, v_tz) FROM r
     WHERE delivered_at >= v_first AND delivered_at < v_last + v_step
    UNION ALL
    SELECT 'r', date_trunc(p_bucket, replied_at, v_tz) FROM r
     WHERE replied_at >= v_first AND replied_at < v_last + v_step
    UNION ALL
    SELECT 'f', date_trunc(p_bucket, failed_at, v_tz) FROM r
     WHERE failed_at >= v_first AND failed_at < v_last + v_step
  ), cnt AS (
    SELECT b,
           count(*) FILTER (WHERE k = 's') AS s, count(*) FILTER (WHERE k = 'd') AS d,
           count(*) FILTER (WHERE k = 'r') AS r, count(*) FILTER (WHERE k = 'f') AS f
      FROM ev GROUP BY b
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           't', g.t, 'sent', COALESCE(c.s, 0), 'delivered', COALESCE(c.d, 0),
           'replied', COALESCE(c.r, 0), 'failed', COALESCE(c.f, 0)) ORDER BY g.t), '[]'::jsonb)
    INTO v_series
    FROM generate_series(v_first, v_last, v_step) AS g(t)
    LEFT JOIN cnt c ON c.b = g.t;

  SELECT jsonb_build_object(
           'sent',      jsonb_agg(x.s ORDER BY x.i), 'delivered', jsonb_agg(x.d ORDER BY x.i),
           'replied',   jsonb_agg(x.r ORDER BY x.i), 'failed',    jsonb_agg(x.f ORDER BY x.i))
    INTO v_spark
    FROM (
      SELECT i,
             (SELECT count(*) FROM public.talkx_recipients t WHERE t.campaign_id = p_campaign_id
                 AND (p_segment_id IS NULL OR t.segment_id = p_segment_id)
                 AND t.sent_at >= v_now - make_interval(mins => (12 - i) * 5)
                 AND t.sent_at <  v_now - make_interval(mins => (11 - i) * 5)) AS s,
             (SELECT count(*) FROM public.talkx_recipients t WHERE t.campaign_id = p_campaign_id
                 AND (p_segment_id IS NULL OR t.segment_id = p_segment_id)
                 AND t.delivered_at >= v_now - make_interval(mins => (12 - i) * 5)
                 AND t.delivered_at <  v_now - make_interval(mins => (11 - i) * 5)) AS d,
             (SELECT count(*) FROM public.talkx_recipients t WHERE t.campaign_id = p_campaign_id
                 AND (p_segment_id IS NULL OR t.segment_id = p_segment_id)
                 AND t.replied_at >= v_now - make_interval(mins => (12 - i) * 5)
                 AND t.replied_at <  v_now - make_interval(mins => (11 - i) * 5)) AS r,
             (SELECT count(*) FROM public.talkx_recipients t WHERE t.campaign_id = p_campaign_id
                 AND (p_segment_id IS NULL OR t.segment_id = p_segment_id)
                 AND t.failed_at >= v_now - make_interval(mins => (12 - i) * 5)
                 AND t.failed_at <  v_now - make_interval(mins => (11 - i) * 5)) AS f
        FROM generate_series(0, 11) AS i
    ) AS x;

  -- Limiar de parada: o maior entre 180 s e 3x (intervalo maximo + digitacao maxima).
  v_threshold := make_interval(secs => GREATEST(180,
                   3 * (v_camp.send_interval_max + v_camp.typing_delay_max) / 1000.0));
  v_last_activity := GREATEST(v_last_activity, v_camp.started_at, v_camp.updated_at);

  IF v_camp.whatsapp_connection_id IS NOT NULL THEN
    SELECT status INTO v_conn FROM public.whatsapp_connections WHERE id = v_camp.whatsapp_connection_id;
  END IF;

  v_state := CASE
    WHEN v_camp.status = 'sending' AND v_remaining > 0 AND v_last_activity < v_now - v_threshold THEN 'stalled'
    WHEN v_camp.status = 'sending' THEN 'sending'
    WHEN v_camp.status = 'paused' AND COALESCE(v_camp.pause_reason, 'manual') = 'manual' THEN 'paused_manual'
    WHEN v_camp.status = 'paused' THEN 'paused_auto'
    WHEN v_camp.status IN ('completed', 'cancelled') THEN 'done'
    ELSE 'idle'
  END;

  v_reco := CASE
    WHEN v_state IN ('sending', 'stalled', 'paused_auto')
         AND v_camp.whatsapp_connection_id IS NOT NULL
         AND v_conn IS DISTINCT FROM 'connected' THEN 'connection_down'
    WHEN v_state = 'stalled' THEN 'stalled'
    WHEN v_processed >= 50 AND v_failed::numeric / v_processed > 0.05 THEN 'high_failure'
    WHEN v_total > 0 AND v_optouts::numeric / v_total > 0.02 THEN 'optout_spike'
    WHEN v_old_sent >= 50 AND v_old_delivered::numeric / v_old_sent < 0.8 THEN 'low_delivery'
    ELSE 'ok'
  END;

  -- === N-117: bloco motor lido de talkx_engine_health ===
  v_motor := (
    SELECT jsonb_build_object(
      'stalled_campaign', EXISTS (
        SELECT 1 FROM public.talkx_engine_health
         WHERE kind = 'stalled_campaign'
      ),
      'stale_lease', EXISTS (
        SELECT 1 FROM public.talkx_engine_health
         WHERE kind = 'stale_lease'
      ),
      'outcome_unknown_24h', COALESCE((
        SELECT metric_count FROM public.talkx_engine_health
         WHERE kind = 'outcome_unknown_24h'
      ), 0),
      'failure_rate_15m', COALESCE((
        SELECT metric_rate FROM public.talkx_engine_health
         WHERE kind = 'failure_rate_15m'
      ), 0),
      'cron_status', COALESCE((
        SELECT status FROM public.talkx_engine_health
         WHERE kind = 'cron_run'
         ORDER BY observed_at DESC LIMIT 1
      ), 'unknown')
    )
  );

  -- Resposta final (mesma estrutura do X140 + bloco motor na saude).
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'sent', v_sent, 'delivered', v_delivered, 'replied', v_replied, 'failed', v_failed,
      'optouts', v_optouts, 'to_confirm', v_unknown, 'skipped', v_skipped,
      'remaining', v_remaining, 'total', v_total,
      'delivery_rate_pct', CASE WHEN v_sent > 0 THEN round(100.0 * v_delivered / v_sent, 1) END,
      'optout_rate_pct',   CASE WHEN v_total > 0 THEN round(100.0 * v_optouts / v_total, 1) END),
    'vs_yesterday', CASE WHEN v_sent_yday > 0 THEN jsonb_build_object(
      'replied', jsonb_build_object('today', v_replied_today, 'yesterday', v_replied_yday),
      'failed',  jsonb_build_object('today', v_failed_today,  'yesterday', v_failed_yday)) END,
    'forecast', jsonb_build_object('per_minute', NULL, 'pct_vs_forecast', NULL, 'estimated_end', NULL),
    'spark', v_spark,
    'series', v_series,
    'reply_peak', jsonb_build_object('last_10_min', v_peak_now, 'previous_10_min', v_peak_prev),
    'health', jsonb_build_object(
      'worker_state', v_state,
      'pause_reason', CASE WHEN v_state = 'paused_auto' THEN v_camp.pause_reason END,
      'last_activity_at', v_last_activity,
      'rate_per_minute', round(v_recent_sent / 5.0, 1),
      'recommendation_code', v_reco,
      'motor', v_motor)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_monitor_panel(uuid, integer, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_monitor_panel(uuid, integer, text, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.talkx_monitor_panel(uuid, integer, text, date, uuid) IS
  'Talk X (N-117 + X140): numeros do monitor da campanha numa conta unica (kpis, vs_yesterday, forecast, spark, series com zeros, reply_peak, health com bloco motor de talkx_engine_health). SECURITY DEFINER; dono ou admin/supervisor, senao 42501.';