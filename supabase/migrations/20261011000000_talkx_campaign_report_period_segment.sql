-- talkx_campaign_report_period_segment
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb); CREATE OR REPLACE FUNCTION public.talkx_campaign_report(p_campaign uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$ DECLARE v_result jsonb; BEGIN IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign USING ERRCODE = 'P0002'; END IF; WITH camp AS (SELECT * FROM public.talkx_campaigns WHERE id = p_campaign), kpis AS (SELECT c.total_recipients, c.sent_count, c.delivered_count, c.failed_count, c.outcome_unknown_count, ROUND(CASE WHEN c.sent_count > 0 THEN c.delivered_count::numeric / c.sent_count * 100 ELSE 0 END, 1) AS delivery_rate_pct, EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs FROM camp c), hourly AS (SELECT date_trunc('hour', r.sent_at) AS hour, COUNT(*) FILTER (WHERE r.status IN ('sent','delivered')) AS sent, COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered FROM public.talkx_recipients r WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL GROUP BY 1 ORDER BY 1), by_status AS (SELECT status, COUNT(*) AS cnt FROM public.talkx_recipients WHERE campaign_id = p_campaign GROUP BY 1), by_variant AS (SELECT v.id AS variant_id, v.label AS variant_name, COUNT(r.id) AS recipients, COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent FROM public.talkx_recipients r LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id WHERE r.campaign_id = p_campaign GROUP BY v.id, v.label) SELECT jsonb_build_object('campaign_id', p_campaign, 'kpis', to_jsonb(kpis.*), 'by_status', (SELECT jsonb_object_agg(status, cnt) FROM by_status), 'hourly_series', (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h), 'by_variant', (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)) INTO v_result FROM kpis; IF v_result IS NULL THEN RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign USING ERRCODE = 'P0002'; END IF; RETURN v_result; END; $$; REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) TO service_role, authenticated;
-- Drop the old single-arg function and create the new multi-arg version
DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid);
CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
  p_campaign uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text,
  p_segment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_granularity text;
BEGIN
  -- Validate campaign exists and caller has access
  IF NOT EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign
  ) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = '22023';
  END IF;

  -- Validate granularity
  v_granularity := lower(coalesce(p_granularity, 'day'));
  IF v_granularity NOT IN ('hour', 'day', 'week', 'month') THEN
    RAISE EXCEPTION 'talkx_campaign_report: granularidade invalida %', p_granularity
      USING ERRCODE = '22023';
  END IF;

  -- Build the time series
  WITH camp AS (
    SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
  ),
  -- Segment filter: if p_segment is not null, filter recipients by segment_id
  segment_filter AS (
    SELECT
      CASE
        WHEN p_segment IS NULL THEN NULL
        WHEN p_segment ? 'segment_id' THEN (p_segment->>'segment_id')::uuid
        ELSE NULL
      END AS segment_id
  ),
  base_recipients AS (
    SELECT r.*
    FROM public.talkx_recipients r
    CROSS JOIN segment_filter sf
    WHERE r.campaign_id = p_campaign
      AND r.sent_at IS NOT NULL
      AND r.sent_at >= p_from
      AND r.sent_at < p_to
      AND (sf.segment_id IS NULL OR r.segment_id = sf.segment_id)
  ),
  time_series AS (
    SELECT
      date_trunc(v_granularity, b.sent_at) AS period_start,
      date_trunc(v_granularity, b.sent_at) +
        CASE v_granularity
          WHEN 'hour' THEN interval '1 hour'
          WHEN 'day' THEN interval '1 day'
          WHEN 'week' THEN interval '1 week'
          WHEN 'month' THEN interval '1 month'
        END AS period_end,
      COUNT(*) FILTER (WHERE b.status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE b.status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE b.read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE b.clicked_at IS NOT NULL) AS clicked,
      COUNT(*) FILTER (WHERE b.status = 'failed') AS bounced,
      0 AS unsubscribed,
      COUNT(*) FILTER (WHERE b.replied_at IS NOT NULL) AS replied,
      COALESCE(SUM(c.value), 0) AS revenue
    FROM base_recipients b
    LEFT JOIN public.talkx_conversions c
      ON c.recipient_id = b.id AND c.campaign_id = p_campaign
      AND c.occurred_at >= p_from AND c.occurred_at < p_to
    GROUP BY 1, 2
    ORDER BY 1
  ),
  funnel AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
      COUNT(*) FILTER (WHERE status = 'failed') AS bounced,
      0 AS unsubscribed,
      COALESCE(SUM(c.value), 0) AS revenue
    FROM base_recipients b
    LEFT JOIN public.talkx_conversions c
      ON c.recipient_id = b.id AND c.campaign_id = p_campaign
      AND c.occurred_at >= p_from AND c.occurred_at < p_to
  ),
  kpis AS (
    SELECT
      camp.total_recipients,
      camp.sent_count,
      camp.delivered_count,
      camp.failed_count,
      ROUND(
        CASE WHEN camp.sent_count > 0
          THEN camp.delivered_count::numeric / camp.sent_count * 100
          ELSE 0
        END, 1
      ) AS delivery_rate_pct,
      EXTRACT(EPOCH FROM (COALESCE(camp.completed_at, NOW()) - camp.started_at))::int AS duration_secs
    FROM camp
  )
  SELECT jsonb_build_object(
    'campaign_id', p_campaign,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'granularity', v_granularity,
    'time_series', (SELECT jsonb_agg(to_jsonb(ts) ORDER BY ts.period_start) FROM time_series ts),
    'funnel', to_jsonb(f.*),
    'kpis', to_jsonb(k.*)
  ) INTO v_result
  FROM funnel f, kpis k;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$$;

-- Permissions: only service_role can call this function
REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb) TO service_role;