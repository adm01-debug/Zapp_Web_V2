CREATE OR REPLACE FUNCTION public.talkx_top_segments(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '90 days';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY avg_reply_rate_pct DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'segment_id', cm.segment_id,
        'segment_name', s.name,
        'campaign_count', COUNT(*),
        'total_recipients', SUM(cm.total_recipients),
        'avg_delivery_rate_pct', ROUND(AVG(cm.delivery_rate_pct)::numeric, 1),
        'avg_reply_rate_pct', ROUND(AVG(cm.reply_rate_pct)::numeric, 1)
      ) AS row,
      ROUND(AVG(cm.reply_rate_pct)::numeric, 1) AS avg_reply_rate_pct
    FROM public.talkx_campaign_metrics cm
    LEFT JOIN public.talkx_segments s ON s.id = cm.segment_id
    WHERE cm.completed_at >= v_cutoff AND cm.segment_id IS NOT NULL
    GROUP BY cm.segment_id, s.name
    ORDER BY avg_reply_rate_pct DESC
    LIMIT LEAST(p_limit, 50)
  ) sub;

  RETURN jsonb_build_object(
    'window_days', 90,
    'as_of', now(),
    'segments', v_result
  );
END;
$function$
