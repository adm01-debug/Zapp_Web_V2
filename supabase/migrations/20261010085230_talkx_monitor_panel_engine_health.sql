-- talkx_monitor_panel: bloco de saude do motor (motor health) lido de talkx_engine_health
-- versão 20261010085230 reservada para hermes-talkx-monitor-panel-engine-health-261010085230
-- Rollback:
--   1) recriar public.talkx_monitor_panel() sem o bloco motor (corpo da versão anterior,
--      sem a consulta a public.talkx_engine_health e sem a chave 'motor' no jsonb_build_object
--      da saude)
--   2) DROP FUNCTION IF EXISTS public.talkx_monitor_panel(uuid, integer, text, date, uuid);
--   3) REVOKE ALL ON FUNCTION public.talkx_monitor_panel(uuid, integer, text, date, uuid) FROM PUBLIC, anon, authenticated;
--   4) DROP VIEW IF EXISTS public.talkx_engine_health; (só se a view tambem for removida;
--      enquanto a view existir, a migration de rollback apenas recria a funcao sem o motor)
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
  v_state      text;
  v_reco       text;
  v_recent_sent integer;
  v_last_activity timestamptz;
  v_optouts    integer;
  v_unknown    integer;
  v_skipped    integer;
  v_sent       integer;
  v_delivered  integer;
  v_replied    integer;
  v_failed     integer;
  v_total      integer;
  v_remaining  integer;
  v_to_confirm integer;
  v_sent_yday  integer;
  v_replied_yday integer;
  v_failed_yday  integer;
  v_replied_today integer;
  v_failed_today  integer;
  v_peak_now   integer;
  v_peak_prev  integer;
  v_spark      jsonb;
  v_series     jsonb;
  v_motor      jsonb;
BEGIN
  -- Autenticacao e autorizacao (mesma regra do X140: dono ou admin/supervisor).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_camp
    FROM public.talkx_campaigns c
   WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '42501';
  END IF;

  IF v_camp.created_by != v_uid
     AND NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '42501';
  END IF;

  -- Janela e bucket.
  v_tz := COALESCE(v_camp.schedule_timezone, 'America/Sao_Paulo');
  v_threshold := make_interval(mins => p_window_minutes);
  v_step := CASE p_bucket
    WHEN 'hour'  THEN interval '1 hour'
    WHEN 'day'   THEN interval '1 day'
    ELSE interval '1 minute'
  END;
  v_last := date_trunc(p_bucket, v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_first := v_last - (p_window_minutes || ' minutes')::interval;
  v_today := date_trunc('day', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_yesterday := v_today - interval '1 day';

  -- Estado do worker.
  v_state := 'sending';
  IF v_camp.status = 'paused' THEN
    v_state := 'paused_auto';
  ELSIF v_camp.status = 'completed' THEN
    v_state := 'done';
  ELSIF v_camp.status = 'draft' THEN
    v_state := 'draft';
  END IF;

  -- Recomendacao baseada no estado.
  v_reco := 'ok';
  IF v_state = 'stalled' THEN
    v_reco := 'stalled';
  ELSIF v_state = 'paused_auto' THEN
    v_reco := 'paused_auto';
  ELSIF v_state = 'sending' THEN
    SELECT count(*) INTO v_optouts
      FROM public.talkx_recipients r
     WHERE r.campaign_id = p_campaign_id
       AND r.status = 'outcome_unknown'
       AND r.updated_at >= now() - interval '24 hours';
    IF v_optouts > 0 THEN
      v_reco := 'optout_spike';
    END IF;
    SELECT count(*) INTO v_failed
      FROM public.talkx_recipients r
     WHERE r.campaign_id = p_campaign_id
       AND r.status = 'failed'
       AND r.updated_at >= now() - interval '15 minutes';
    IF v_failed > 5 THEN
      v_reco := 'high_failure';
    END IF;
  END IF;

  -- Ultima atividade e taxa recente (para worker_state e rate_per_minute).
  SELECT max(sent_at), max(delivered_at)
    INTO v_last_activity, v_recent_sent
    FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id
     AND sent_at >= v_first;
  v_recent_sent := COALESCE(v_recent_sent, 0);

  -- Sparkline (ultimos 12 pontos do bucket).
  v_spark := (
    SELECT jsonb_build_object(
      'sent',      COALESCE(jsonb_agg(sent ORDER BY t), '[]'::jsonb),
      'delivered', COALESCE(jsonb_agg(delivered ORDER BY t), '[]'::jsonb)
    )
    FROM (
      SELECT date_trunc(p_bucket, g.t AT TIME ZONE v_tz) AT TIME ZONE v_tz AS t,
             count(*) FILTER (WHERE r.sent_at >= g.t AND r.sent_at < g.t + v_step) AS sent,
             count(*) FILTER (WHERE r.delivered_at >= g.t AND r.delivered_at < g.t + v_step) AS delivered
        FROM generate_series(v_first, v_last, v_step) g(t)
       LEFT JOIN public.talkx_recipients r
         ON r.campaign_id = p_campaign_id
        AND r.sent_at >= g.t
        AND r.sent_at < g.t + v_step
       GROUP BY g.t
       ORDER BY g.t
    ) sub
  );

  -- Serie completa (pontos do bucket, com zeros onde nao houve envio).
  v_series := (
    SELECT jsonb_agg(
      jsonb_build_object(
        't',  t,
        'sent',      COALESCE(sent, 0),
        'delivered', COALESCE(delivered, 0),
        'replied',   COALESCE(replied, 0)
      ) ORDER BY t
    )
    FROM (
      SELECT date_trunc(p_bucket, g.t AT TIME ZONE v_tz) AT TIME ZONE v_tz AS t,
             count(r.sent_at)      AS sent,
             count(r.delivered_at) AS delivered,
             count(r.replied_at)   AS replied
        FROM generate_series(v_first, v_last, v_step) g(t)
       LEFT JOIN public.talkx_recipients r
         ON r.campaign_id = p_campaign_id
        AND date_trunc(p_bucket, r.sent_at AT TIME ZONE v_tz) AT TIME ZONE v_tz = date_trunc(p_bucket, g.t AT TIME ZONE v_tz) AT TIME ZONE v_tz
       GROUP BY g.t
       ORDER BY g.t
    ) sub
  );

  -- Reply peak (ultimos 10 minutos vs 10 minutos anteriores).
  v_peak_now := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND replied_at >= v_now - interval '10 minutes'
  );
  v_peak_prev := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND replied_at >= v_now - interval '20 minutes'
       AND replied_at < v_now - interval '10 minutes'
  );

  -- Comparativo com ontem (replicado do X140).
  v_sent_yday := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND sent_at >= v_yesterday
       AND sent_at < v_today
  );
  v_replied_yday := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND replied_at >= v_yesterday
       AND replied_at < v_today
  );
  v_failed_yday := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND status = 'failed'
       AND updated_at >= v_yesterday
       AND updated_at < v_today
  );
  v_replied_today := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND replied_at >= v_today
  );
  v_failed_today := (
    SELECT count(*) FROM public.talkx_recipients
     WHERE campaign_id = p_campaign_id
       AND status = 'failed'
       AND updated_at >= v_today
  );

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
    'campaign_id', p_campaign_id,
    'bucket', p_bucket,
    'window_minutes', p_window_minutes,
    'as_of', v_now,
    'kpis', jsonb_build_object(
      'sent', v_sent, 'delivered', v_delivered, 'replied', v_replied,
      'failed', v_failed, 'optouts', v_optouts, 'to_confirm', v_to_confirm,
      'skipped', v_skipped, 'remaining', v_remaining, 'total', v_total,
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