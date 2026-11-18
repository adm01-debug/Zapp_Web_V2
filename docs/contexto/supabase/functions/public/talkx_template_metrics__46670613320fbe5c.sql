CREATE OR REPLACE FUNCTION public.talkx_template_metrics(p_template_id uuid)
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

  IF NOT EXISTS (SELECT 1 FROM public.talkx_templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'template not found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'template_id', p_template_id,
    'window_days', 90,
    'as_of', now(),
    'campaign_count', COUNT(DISTINCT cm.campaign_id),
    'total_recipients', COALESCE(SUM(cm.total_recipients), 0),
    'avg_delivery_rate_pct', ROUND(COALESCE(AVG(cm.delivery_rate_pct), 0)::numeric, 1),
    'avg_reply_rate_pct', ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1),
    'avg_duration_secs', ROUND(COALESCE(AVG(cm.duration_secs), 0)::numeric, 0)
  )
  INTO v_result
  FROM public.talkx_campaign_metrics cm
  WHERE cm.template_id = p_template_id
    AND cm.completed_at >= v_cutoff;

  RETURN COALESCE(v_result, jsonb_build_object(
    'template_id', p_template_id,
    'window_days', 90,
    'as_of', now(),
    'campaign_count', 0,
    'total_recipients', 0,
    'avg_delivery_rate_pct', 0,
    'avg_reply_rate_pct', 0,
    'avg_duration_secs', 0
  ));
END;
$function$
