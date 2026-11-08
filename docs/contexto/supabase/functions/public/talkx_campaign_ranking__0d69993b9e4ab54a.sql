CREATE OR REPLACE FUNCTION public.talkx_campaign_ranking(p_limit integer DEFAULT 20, p_metric text DEFAULT 'reply_rate'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_cutoff timestamptz := now() - interval '90 days';
  v_result jsonb;
BEGIN
  v_profile_id := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);

  IF p_metric NOT IN ('reply_rate', 'delivery_rate', 'recipients', 'duration') THEN
    RAISE EXCEPTION 'invalid metric: %', p_metric USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY score DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'campaign_id', cm.campaign_id,
        'campaign_name', cm.campaign_name,
        'total_recipients', cm.total_recipients,
        'delivery_rate_pct', cm.delivery_rate_pct,
        'reply_rate_pct', cm.reply_rate_pct,
        'duration_secs', cm.duration_secs,
        'completed_at', cm.completed_at
      ) AS row,
      CASE p_metric
        WHEN 'reply_rate'    THEN cm.reply_rate_pct
        WHEN 'delivery_rate' THEN cm.delivery_rate_pct
        WHEN 'recipients'    THEN cm.total_recipients::numeric
        WHEN 'duration'      THEN (-COALESCE(cm.duration_secs, 0))::numeric
      END AS score
    FROM public.talkx_campaign_metrics cm
    WHERE cm.completed_at >= v_cutoff
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR cm.campaign_id IN (
          SELECT id FROM public.talkx_campaigns WHERE created_by = v_profile_id
        )
      )
    ORDER BY score DESC
    LIMIT LEAST(p_limit, 100)
  ) sub;

  RETURN jsonb_build_object(
    'metric', p_metric,
    'window_days', 90,
    'as_of', now(),
    'campaigns', v_result
  );
END;
$function$
