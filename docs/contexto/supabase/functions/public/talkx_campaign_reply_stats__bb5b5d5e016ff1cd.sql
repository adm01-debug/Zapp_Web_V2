CREATE OR REPLACE FUNCTION public.talkx_campaign_reply_stats(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_replied integer;
  v_avg     numeric;
  v_median  numeric;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_reply_stats_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*),
         ROUND(avg(EXTRACT(EPOCH FROM (replied_at - sent_at)))::numeric, 1),
         ROUND((percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (replied_at - sent_at))
                ))::numeric, 1)
    INTO v_replied, v_avg, v_median
    FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id
     AND replied_at IS NOT NULL
     AND sent_at IS NOT NULL;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'replied', COALESCE(v_replied, 0),
    'avg_reply_seconds', v_avg,
    'median_reply_seconds', v_median
  );
END;
$function$
