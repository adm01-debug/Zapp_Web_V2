-- N-134 (Fase 6 · banco): detalhamentos do relatorio Talk X — heatmap 7x24, por
-- segmento (nomes), por link (rotulo distinto do destino) e por variante.
-- SECURITY INVOKER: respeita o RLS do chamador; o acesso ao EXECUTE e restrito
-- por REVOKE/GRANT abaixo (authenticated e service_role).
-- Rollback: a funcao e NOVA (nao existia antes); o rollback remove apenas ela.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.talkx_campaign_report_breakdowns(
  p_campaign uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_tzname text;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report_breakdowns: p_from/p_to nao podem ser nulos'
      USING ERRCODE = '22004';
  END IF;

  SELECT COALESCE(c.schedule_timezone, 'America/Sao_Paulo')
    INTO v_tzname
    FROM public.talkx_campaigns c
    WHERE c.id = p_campaign;
  IF v_tzname IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report_breakdowns: campanha nao encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN (
    WITH tz AS (
      SELECT v_tzname AS tz
    ),
    grid AS (
      SELECT d AS dow, h AS hour
      FROM generate_series(1, 7) d CROSS JOIN generate_series(0, 23) h
    ),
    sent_ev AS (
      SELECT
        EXTRACT(ISODOW FROM (r.sent_at AT TIME ZONE (SELECT tz FROM tz)))::int AS dow,
        EXTRACT(HOUR FROM (r.sent_at AT TIME ZONE (SELECT tz FROM tz)))::int AS hour
      FROM public.talkx_recipients r
      WHERE r.campaign_id = p_campaign
        AND r.sent_at IS NOT NULL
        AND r.sent_at >= p_from AND r.sent_at < p_to
    ),
    reply_ev AS (
      SELECT
        EXTRACT(ISODOW FROM (r.replied_at AT TIME ZONE (SELECT tz FROM tz)))::int AS dow,
        EXTRACT(HOUR FROM (r.replied_at AT TIME ZONE (SELECT tz FROM tz)))::int AS hour
      FROM public.talkx_recipients r
      WHERE r.campaign_id = p_campaign
        AND r.replied_at IS NOT NULL
        AND r.replied_at >= p_from AND r.replied_at < p_to
    ),
    click_ev AS (
      SELECT
        EXTRACT(ISODOW FROM (c.clicked_at AT TIME ZONE (SELECT tz FROM tz)))::int AS dow,
        EXTRACT(HOUR FROM (c.clicked_at AT TIME ZONE (SELECT tz FROM tz)))::int AS hour
      FROM public.talkx_link_clicks c
      JOIN public.talkx_links l ON l.id = c.link_id
      WHERE l.campaign_id = p_campaign
        AND c.clicked_at >= p_from AND c.clicked_at < p_to
    ),
    heat AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dow', g.dow, 'hour', g.hour,
          'sends', COALESCE(s.n, 0),
          'replies', COALESCE(p.n, 0),
          'clicks', COALESCE(k.n, 0)
        )
        ORDER BY g.dow, g.hour
      ) AS cells
      FROM grid g
      LEFT JOIN (SELECT dow, hour, COUNT(*) n FROM sent_ev GROUP BY 1, 2) s
        ON s.dow = g.dow AND s.hour = g.hour
      LEFT JOIN (SELECT dow, hour, COUNT(*) n FROM reply_ev GROUP BY 1, 2) p
        ON p.dow = g.dow AND p.hour = g.hour
      LEFT JOIN (SELECT dow, hour, COUNT(*) n FROM click_ev GROUP BY 1, 2) k
        ON k.dow = g.dow AND k.hour = g.hour
    ),
    seg AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'segment', s.name,
          'sent', rs.sent,
          'replies', rs.replies,
          'conversions', rs.conversions,
          'rate_pct', CASE WHEN rs.sent > 0
            THEN ROUND(rs.conversions::numeric / rs.sent * 100, 1) ELSE 0 END
        )
        ORDER BY s.name
      ) AS rows
      FROM public.talkx_segments s
      JOIN (
        SELECT
          r.segment_id AS sid,
          COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent,
          COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replies,
          COUNT(DISTINCT cv.id) AS conversions
        FROM public.talkx_recipients r
        LEFT JOIN public.talkx_conversions cv
          ON cv.recipient_id = r.id
          AND cv.occurred_at >= p_from AND cv.occurred_at < p_to
        WHERE r.campaign_id = p_campaign
          AND r.segment_id IS NOT NULL
        GROUP BY r.segment_id
      ) rs ON rs.sid = s.id
    ),
    lnk AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', l.label,
          'target_url', l.target_url,
          'clicks', COALESCE(c.clicks, 0),
          'unique_clicks', COALESCE(c.unique_clicks, 0),
          'rate_pct', CASE WHEN COALESCE(sent.n, 0) > 0
            THEN ROUND(COALESCE(c.unique_clicks, 0)::numeric / sent.n * 100, 1) ELSE 0 END
        )
        ORDER BY l.label
      ) AS rows
      FROM public.talkx_links l
      LEFT JOIN (
        SELECT link_id, COUNT(*) AS clicks, COUNT(DISTINCT recipient_id) AS unique_clicks
        FROM public.talkx_link_clicks
        WHERE clicked_at >= p_from AND clicked_at < p_to
        GROUP BY link_id
      ) c ON c.link_id = l.id
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM public.talkx_recipients r
        WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
      ) sent
      WHERE l.campaign_id = p_campaign
    ),
    var AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'variant', v.label,
          'sent', rv.sent,
          'replies', rv.replies,
          'conversions', rv.conversions,
          'rate_pct', CASE WHEN rv.sent > 0
            THEN ROUND(rv.replies::numeric / rv.sent * 100, 1) ELSE 0 END
        )
        ORDER BY v.label
      ) AS rows
      FROM public.talkx_template_variants v
      JOIN (
        SELECT
          r.variant_id AS vid,
          COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent,
          COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replies,
          COUNT(DISTINCT cv.id) AS conversions
        FROM public.talkx_recipients r
        LEFT JOIN public.talkx_conversions cv
          ON cv.recipient_id = r.id
          AND cv.occurred_at >= p_from AND cv.occurred_at < p_to
        WHERE r.campaign_id = p_campaign
          AND r.variant_id IS NOT NULL
        GROUP BY r.variant_id
      ) rv ON rv.vid = v.id
    )
    SELECT jsonb_build_object(
      'heatmap', jsonb_build_object(
        'timezone', (SELECT tz FROM tz),
        'cells', COALESCE((SELECT cells FROM heat), '[]'::jsonb)
      ),
      'by_segment', COALESCE((SELECT rows FROM seg), '[]'::jsonb),
      'by_link', COALESCE((SELECT rows FROM lnk), '[]'::jsonb),
      'by_variant', COALESCE((SELECT rows FROM var), '[]'::jsonb)
    )
  );
END
$func$;

REVOKE ALL ON FUNCTION public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz) TO authenticated, service_role;
