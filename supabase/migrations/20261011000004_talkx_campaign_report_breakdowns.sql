-- talkx_campaign_report_breakdowns
-- Rollback: remover a função talkx_campaign_report_breakdowns
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.talkx_campaign_report_breakdowns(
  p_campaign uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_tz text;
  v_result jsonb;
BEGIN
  SELECT c.schedule_timezone INTO v_tz
  FROM public.talkx_campaigns c
  WHERE c.id = p_campaign;

  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report_breakdowns: campanha % nao encontrada', p_campaign USING ERRCODE = 'P0002';
  END IF;

  WITH heatmap AS (
    SELECT
      EXTRACT(ISODOW FROM r.sent_at AT TIME ZONE v_tz)::int AS dow,
      EXTRACT(HOUR FROM r.sent_at AT TIME ZONE v_tz)::int AS hour,
      COUNT(*) FILTER (WHERE r.sent_at IS NOT NULL) AS sends,
      COUNT(*) FILTER (WHERE r.replied_at IS NOT NULL) AS replies,
      COUNT(cl.id) AS clicks
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_link_clicks cl ON cl.recipient_id = r.id AND cl.clicked_at >= p_from AND cl.clicked_at < p_to
    WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL AND r.sent_at >= p_from AND r.sent_at < p_to
    GROUP BY 1, 2
  ),
  heatmap_pivot AS (
    SELECT
      dow,
      jsonb_object_agg(hour, jsonb_build_object('sends', sends, 'replies', replies, 'clicks', clicks)) AS hours
    FROM heatmap
    GROUP BY dow
    ORDER BY dow
  ),
  by_segment AS (
    SELECT
      s.name AS segment_name,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent,
      COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replies,
      COUNT(DISTINCT cv.id) AS conversions,
      ROUND(CASE WHEN COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) > 0
        THEN COUNT(DISTINCT cv.id)::numeric / COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) * 100
        ELSE 0 END, 1) AS rate_pct
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_segments s ON s.id = r.segment_id
    LEFT JOIN public.talkx_conversions cv ON cv.recipient_id = r.id AND cv.occurred_at >= p_from AND cv.occurred_at < p_to
    WHERE r.campaign_id = p_campaign
    GROUP BY s.name
    ORDER BY sent DESC
  ),
  by_link AS (
    SELECT
      l.label,
      l.target_url,
      COUNT(cl.id) AS clicks,
      COUNT(DISTINCT cl.recipient_id) AS unique_clicks,
      ROUND(CASE WHEN (SELECT COUNT(*) FROM public.talkx_recipients WHERE campaign_id = p_campaign AND sent_at IS NOT NULL) > 0
        THEN COUNT(cl.id)::numeric / (SELECT COUNT(*) FROM public.talkx_recipients WHERE campaign_id = p_campaign AND sent_at IS NOT NULL) * 100
        ELSE 0 END, 1) AS rate_pct
    FROM public.talkx_links l
    LEFT JOIN public.talkx_link_clicks cl ON cl.link_id = l.id AND cl.clicked_at >= p_from AND cl.clicked_at < p_to
    WHERE l.campaign_id = p_campaign
    GROUP BY l.label, l.target_url
    ORDER BY clicks DESC
  ),
  by_variant AS (
    SELECT
      tv.label AS variant_label,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent,
      COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replies,
      COUNT(DISTINCT cv.id) AS conversions,
      ROUND(CASE WHEN COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) > 0
        THEN COUNT(DISTINCT cv.id)::numeric / COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) * 100
        ELSE 0 END, 1) AS rate_pct
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_template_variants tv ON tv.id = r.variant_id
    LEFT JOIN public.talkx_conversions cv ON cv.recipient_id = r.id AND cv.occurred_at >= p_from AND cv.occurred_at < p_to
    WHERE r.campaign_id = p_campaign
    GROUP BY tv.label
    ORDER BY sent DESC
  )
  SELECT jsonb_build_object(
    'heatmap', (SELECT jsonb_agg(jsonb_build_object('dow', dow, 'hours', hours) ORDER BY dow) FROM heatmap_pivot),
    'by_segment', (SELECT jsonb_agg(to_jsonb(bs) ORDER BY bs.sent DESC) FROM by_segment bs),
    'by_link', (SELECT jsonb_agg(to_jsonb(bl) ORDER BY bl.clicks DESC) FROM by_link bl),
    'by_variant', (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.sent DESC) FROM by_variant bv)
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;