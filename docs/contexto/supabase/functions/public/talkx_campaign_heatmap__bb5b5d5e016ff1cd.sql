CREATE OR REPLACE FUNCTION public.talkx_campaign_heatmap(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_tz text := 'America/Sao_Paulo';
  v_result jsonb;
BEGIN
  v_profile_id := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);
  IF NOT EXISTS (
    SELECT 1 FROM public.talkx_campaigns c
    WHERE c.id = p_campaign_id
      AND (c.created_by = v_profile_id OR public.is_admin_or_supervisor(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'tz', v_tz,
    'cells', COALESCE(
      jsonb_agg(
        jsonb_build_object('dow', dow, 'hour', hour, 'sent', sent, 'delivered', delivered, 'replied', replied)
        ORDER BY dow, hour
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    SELECT
      EXTRACT(DOW FROM sent_at AT TIME ZONE v_tz)::int AS dow,
      EXTRACT(HOUR FROM sent_at AT TIME ZONE v_tz)::int AS hour,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM public.talkx_recipients
    WHERE campaign_id = p_campaign_id AND sent_at IS NOT NULL
    GROUP BY dow, hour
  ) sub;

  RETURN COALESCE(
    v_result,
    jsonb_build_object('campaign_id', p_campaign_id, 'tz', v_tz, 'cells', '[]'::jsonb)
  );
END;
$function$
