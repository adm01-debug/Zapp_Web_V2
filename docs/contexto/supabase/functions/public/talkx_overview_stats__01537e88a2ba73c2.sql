CREATE OR REPLACE FUNCTION public.talkx_overview_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_audience_source text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_timezone text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev_from timestamptz;
  v_curr      jsonb;
  v_prev      jsonb;
  v_active    integer;
  v_daily     jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_from e p_to sao obrigatorios' USING ERRCODE = '22004';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_to precisa ser posterior a p_from' USING ERRCODE = '22007';
  END IF;

  v_prev_from := p_from - (p_to - p_from);

  -- ---------------------------------------------------------------- current
  WITH sc AS (
    SELECT campaign_id
    FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
  ),
  camp AS (
    SELECT c.status, c.failed_count, c.outcome_unknown_count
    FROM public.talkx_campaigns AS c
    JOIN sc ON sc.campaign_id = c.id
    WHERE c.started_at >= p_from AND c.started_at < p_to
  ),
  rec AS (
    SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at, r.read_at, r.segment_id
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE (r.sent_at >= p_from AND r.sent_at < p_to)
       OR (r.delivered_at >= p_from AND r.delivered_at < p_to)
       OR (r.replied_at >= p_from AND r.replied_at < p_to)
       OR (r.read_at >= p_from AND r.read_at < p_to)
  ),
  cv AS (
    SELECT cv.value,
           (SELECT r2.segment_id FROM public.talkx_recipients AS r2 WHERE r2.id = cv.recipient_id) AS segment_id
    FROM public.talkx_conversions AS cv
    JOIN sc ON sc.campaign_id = cv.campaign_id
    WHERE cv.occurred_at >= p_from AND cv.occurred_at < p_to
  ),
  flags AS (
    SELECT
      EXISTS (SELECT 1
              FROM public.talkx_recipients AS r2
              JOIN sc ON sc.campaign_id = r2.campaign_id
              WHERE r2.read_at IS NOT NULL) AS any_read,
      EXISTS (SELECT 1
              FROM public.talkx_conversions AS c2
              JOIN sc ON sc.campaign_id = c2.campaign_id) AS any_conv
  ),
  agg AS (
    SELECT
      (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to) AS sent,
      (SELECT count(*) FROM rec WHERE delivered_at >= p_from AND delivered_at < p_to) AS delivered,
      (SELECT count(*) FROM rec WHERE replied_at >= p_from AND replied_at < p_to) AS replied,
      (SELECT count(*) FROM rec WHERE read_at >= p_from AND read_at < p_to) AS read_c,
      (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to AND segment_id IS NOT NULL) AS sent_seg,
      (SELECT count(*) FROM cv) AS conv_c,
      (SELECT count(*) FROM cv WHERE segment_id IS NOT NULL) AS conv_seg,
      (SELECT coalesce(sum(value), 0) FROM cv) AS revenue
  )
  SELECT jsonb_build_object(
    'campaigns_sent',   (SELECT count(*) FROM camp),
    'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
    'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                         WHERE sent_at >= p_from AND sent_at < p_to),
    'sent',             a.sent,
    'delivered',        a.delivered,
    'replied',          a.replied,
    'read',             CASE WHEN f.any_read THEN to_jsonb(a.read_c) ELSE 'null'::jsonb END,
    'conversions',      CASE WHEN f.any_conv THEN to_jsonb(a.conv_c) ELSE 'null'::jsonb END,
    'revenue',          CASE WHEN f.any_conv THEN to_jsonb(a.revenue) ELSE 'null'::jsonb END,
    'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
    'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
    'delivery_rate_pct', CASE
        WHEN a.sent > 0
        THEN round(a.delivered::numeric / a.sent * 100, 1)
        ELSE 0 END,
    'reply_rate_pct', CASE
        WHEN a.sent > 0
        THEN round(a.replied::numeric / a.sent * 100, 1)
        ELSE 0 END,
    'conversion_rate_pct', CASE
        WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1)
        WHEN f.any_conv THEN 0
        ELSE NULL END,
    'segment_conversion_rate_pct', CASE
        WHEN f.any_conv AND a.sent_seg > 0 THEN round(a.conv_seg::numeric / a.sent_seg * 100, 1)
        ELSE NULL END,
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'sent',        'count', a.sent,
        'pct', CASE WHEN a.sent > 0 THEN 100.0 END),
      jsonb_build_object('step', 'delivered',   'count', a.delivered,
        'pct', CASE WHEN a.sent > 0 THEN round(a.delivered::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'read',        'count', CASE WHEN f.any_read THEN a.read_c END,
        'pct', CASE WHEN f.any_read AND a.sent > 0 THEN round(a.read_c::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'replied',     'count', a.replied,
        'pct', CASE WHEN a.sent > 0 THEN round(a.replied::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'conversions', 'count', CASE WHEN f.any_conv THEN a.conv_c END,
        'pct', CASE WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1) END)
    )
  ) INTO v_curr
  FROM agg a CROSS JOIN flags f;

  -- --------------------------------------------------------------- previous
  -- NULL quando o periodo anterior nao tem campanha iniciada (sem base de comparacao).
  IF EXISTS (
    SELECT 1
    FROM public.talkx_campaigns AS c
    JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc
      ON sc.campaign_id = c.id
    WHERE c.started_at >= v_prev_from AND c.started_at < p_from
  ) THEN
    WITH sc AS (
      SELECT campaign_id
      FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
    ),
    camp AS (
      SELECT c.status, c.failed_count, c.outcome_unknown_count
      FROM public.talkx_campaigns AS c
      JOIN sc ON sc.campaign_id = c.id
      WHERE c.started_at >= v_prev_from AND c.started_at < p_from
    ),
    rec AS (
      SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at, r.read_at, r.segment_id
      FROM public.talkx_recipients AS r
      JOIN sc ON sc.campaign_id = r.campaign_id
      WHERE (r.sent_at >= v_prev_from AND r.sent_at < p_from)
         OR (r.delivered_at >= v_prev_from AND r.delivered_at < p_from)
         OR (r.replied_at >= v_prev_from AND r.replied_at < p_from)
         OR (r.read_at >= v_prev_from AND r.read_at < p_from)
    ),
    cv AS (
      SELECT cv.value,
             (SELECT r2.segment_id FROM public.talkx_recipients AS r2 WHERE r2.id = cv.recipient_id) AS segment_id
      FROM public.talkx_conversions AS cv
      JOIN sc ON sc.campaign_id = cv.campaign_id
      WHERE cv.occurred_at >= v_prev_from AND cv.occurred_at < p_from
    ),
    flags AS (
      SELECT
        EXISTS (SELECT 1
                FROM public.talkx_recipients AS r2
                JOIN sc ON sc.campaign_id = r2.campaign_id
                WHERE r2.read_at IS NOT NULL) AS any_read,
        EXISTS (SELECT 1
                FROM public.talkx_conversions AS c2
                JOIN sc ON sc.campaign_id = c2.campaign_id) AS any_conv
    ),
    agg AS (
      SELECT
        (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from) AS sent,
        (SELECT count(*) FROM rec WHERE delivered_at >= v_prev_from AND delivered_at < p_from) AS delivered,
        (SELECT count(*) FROM rec WHERE replied_at >= v_prev_from AND replied_at < p_from) AS replied,
        (SELECT count(*) FROM rec WHERE read_at >= v_prev_from AND read_at < p_from) AS read_c,
        (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from AND segment_id IS NOT NULL) AS sent_seg,
        (SELECT count(*) FROM cv) AS conv_c,
        (SELECT count(*) FROM cv WHERE segment_id IS NOT NULL) AS conv_seg,
        (SELECT coalesce(sum(value), 0) FROM cv) AS revenue
    )
    SELECT jsonb_build_object(
      'campaigns_sent',   (SELECT count(*) FROM camp),
      'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
      'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                           WHERE sent_at >= v_prev_from AND sent_at < p_from),
      'sent',             a.sent,
      'delivered',        a.delivered,
      'replied',          a.replied,
      'read',             CASE WHEN f.any_read THEN to_jsonb(a.read_c) ELSE 'null'::jsonb END,
      'conversions',      CASE WHEN f.any_conv THEN to_jsonb(a.conv_c) ELSE 'null'::jsonb END,
      'revenue',          CASE WHEN f.any_conv THEN to_jsonb(a.revenue) ELSE 'null'::jsonb END,
      'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
      'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
      'delivery_rate_pct', CASE
          WHEN a.sent > 0
          THEN round(a.delivered::numeric / a.sent * 100, 1)
          ELSE 0 END,
      'reply_rate_pct', CASE
          WHEN a.sent > 0
          THEN round(a.replied::numeric / a.sent * 100, 1)
          ELSE 0 END,
      'conversion_rate_pct', CASE
          WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1)
          WHEN f.any_conv THEN 0
          ELSE NULL END,
      'segment_conversion_rate_pct', CASE
          WHEN f.any_conv AND a.sent_seg > 0 THEN round(a.conv_seg::numeric / a.sent_seg * 100, 1)
          ELSE NULL END,
      'funnel', jsonb_build_array(
        jsonb_build_object('step', 'sent',        'count', a.sent,
          'pct', CASE WHEN a.sent > 0 THEN 100.0 END),
        jsonb_build_object('step', 'delivered',   'count', a.delivered,
          'pct', CASE WHEN a.sent > 0 THEN round(a.delivered::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'read',        'count', CASE WHEN f.any_read THEN a.read_c END,
          'pct', CASE WHEN f.any_read AND a.sent > 0 THEN round(a.read_c::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'replied',     'count', a.replied,
          'pct', CASE WHEN a.sent > 0 THEN round(a.replied::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'conversions', 'count', CASE WHEN f.any_conv THEN a.conv_c END,
          'pct', CASE WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1) END)
      )
    ) INTO v_prev
    FROM agg a CROSS JOIN flags f;
  ELSE
    v_prev := NULL;
  END IF;

  -- ----------------------------------------------------------------- active
  -- O "agora" da operacao, sem recorte de periodo.
  SELECT count(*) INTO v_active
  FROM public.talkx_campaigns AS c
  JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc
    ON sc.campaign_id = c.id
  WHERE c.status IN ('sending', 'scheduled', 'paused');

  -- ------------------------------------------------------------------ daily
  -- Um ponto por dia do periodo, no fuso pedido, com zero-fill.
  WITH days AS (
    SELECT gs::date AS day
    FROM generate_series(
      (p_from AT TIME ZONE p_timezone)::date,
      ((p_to - interval '1 microsecond') AT TIME ZONE p_timezone)::date,
      interval '1 day'
    ) AS gs
  ),
  sc AS (
    SELECT campaign_id
    FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
  ),
  snt AS (
    SELECT (r.sent_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.sent_at >= p_from AND r.sent_at < p_to
    GROUP BY 1
  ),
  dlv AS (
    SELECT (r.delivered_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.delivered_at >= p_from AND r.delivered_at < p_to
    GROUP BY 1
  ),
  rpl AS (
    SELECT (r.replied_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.replied_at >= p_from AND r.replied_at < p_to
    GROUP BY 1
  ),
  cvd AS (
    SELECT (cv.occurred_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_conversions AS cv
    JOIN sc ON sc.campaign_id = cv.campaign_id
    WHERE cv.occurred_at >= p_from AND cv.occurred_at < p_to
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'day',         d.day,
      'sent',        coalesce(snt.c, 0),
      'delivered',   coalesce(dlv.c, 0),
      'replied',     coalesce(rpl.c, 0),
      'conversions', coalesce(cvd.c, 0)
    ) ORDER BY d.day
  )
  INTO v_daily
  FROM days d
  LEFT JOIN snt ON snt.day = d.day
  LEFT JOIN dlv ON dlv.day = d.day
  LEFT JOIN rpl ON rpl.day = d.day
  LEFT JOIN cvd ON cvd.day = d.day;

  RETURN jsonb_build_object(
    'period',   jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_timezone),
    'current',  jsonb_set(v_curr, '{active}', to_jsonb(v_active)),
    'previous', v_prev,
    'active',   v_active,
    'daily',    coalesce(v_daily, '[]'::jsonb)
  );
END;
$function$
