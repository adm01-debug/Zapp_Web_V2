CREATE OR REPLACE FUNCTION public.talkx_template_library_kpis()
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
        'template_id', t.id,
        'template_name', t.name,
        'campaign_count', COUNT(DISTINCT cm.campaign_id),
        'total_recipients', COALESCE(SUM(cm.total_recipients), 0),
        'avg_delivery_rate_pct', ROUND(COALESCE(AVG(cm.delivery_rate_pct), 0)::numeric, 1),
        'avg_reply_rate_pct', ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1)
      ) AS row,
      ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1) AS avg_reply_rate_pct
    FROM public.talkx_templates t
    LEFT JOIN public.talkx_campaign_metrics cm
      ON cm.template_id = t.id AND cm.completed_at >= v_cutoff
    GROUP BY t.id, t.name
    ORDER BY avg_reply_rate_pct DESC
  ) sub;

  RETURN jsonb_build_object(
    'window_days', 90,
    'as_of', now(),
    'templates', v_result
  );
END;
$function$
