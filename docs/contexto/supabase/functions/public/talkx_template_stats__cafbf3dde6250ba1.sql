CREATE OR REPLACE FUNCTION public.talkx_template_stats(p_template_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dur interval;
  v_cur jsonb;
  v_prev jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_template_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'invalid window' USING ERRCODE = '22023';
  END IF;

  v_dur := p_to - p_from;

  WITH janelas(idx, ini, fim) AS (
    VALUES (1, p_from, p_to), (2, p_from - v_dur, p_from)
  ),
  envios AS (
    SELECT j.idx,
           COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL)    AS sent,
           COUNT(r.id) FILTER (WHERE r.replied_at IS NOT NULL) AS replied
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_recipients r
           ON r.campaign_id = c.id
          AND r.sent_at >= j.ini
          AND r.sent_at <  j.fim
    GROUP BY j.idx
  ),
  conv AS (
    SELECT j.idx, COUNT(cv.id) AS converted
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_conversions cv
           ON cv.campaign_id = c.id
          AND COALESCE(cv.occurred_at, cv.created_at) >= j.ini
          AND COALESCE(cv.occurred_at, cv.created_at) <  j.fim
    GROUP BY j.idx
  ),
  opt AS (
    SELECT j.idx, COALESCE(SUM(o.optout_count), 0)::bigint AS opted_out
    FROM janelas j
    LEFT JOIN public.talkx_campaigns c ON c.template_id = p_template_id
    LEFT JOIN public.talkx_campaign_optouts o
           ON o.campaign_id = c.id
          AND o.last_optout_at >= j.ini
          AND o.last_optout_at <  j.fim
    GROUP BY j.idx
  ),
  agregados AS (
    SELECT e.idx,
           jsonb_build_object(
             'sent', e.sent,
             'replied', e.replied,
             'converted', cv.converted,
             'opted_out', o.opted_out,
             'reply_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((e.replied::numeric * 100) / e.sent, 1) END,
             'conversion_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((cv.converted::numeric * 100) / e.sent, 1) END,
             'rejection_rate_pct',
               CASE WHEN e.sent > 0 THEN ROUND((o.opted_out::numeric * 100) / e.sent, 1) END
           ) AS obj
    FROM envios e
    JOIN conv cv ON cv.idx = e.idx
    JOIN opt  o  ON o.idx  = e.idx
  )
  SELECT (SELECT obj FROM agregados WHERE idx = 1),
         (SELECT obj FROM agregados WHERE idx = 2)
  INTO v_cur, v_prev;

  v_cur := COALESCE(v_cur, jsonb_build_object(
    'sent', 0, 'replied', 0, 'converted', 0, 'opted_out', 0,
    'reply_rate_pct', NULL, 'conversion_rate_pct', NULL, 'rejection_rate_pct', NULL
  ));

  RETURN v_cur || jsonb_build_object(
    'previous',
    CASE WHEN COALESCE((v_prev->>'sent')::bigint, 0) > 0 THEN v_prev ELSE NULL END
  );
END;
$function$
