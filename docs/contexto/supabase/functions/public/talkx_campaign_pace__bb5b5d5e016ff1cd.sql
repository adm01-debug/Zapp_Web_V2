CREATE OR REPLACE FUNCTION public.talkx_campaign_pace(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_connection_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL; -- service_role passa direto
  ELSIF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT campaign.whatsapp_connection_id
    INTO v_connection_id
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id;

  IF v_connection_id IS NULL THEN
    RETURN jsonb_build_object(
      'minute_limit', 0, 'minute_sent', 0, 'minute_remaining', 0,
      'day_limit', 0, 'day_sent', 0, 'day_remaining', 0, 'next_day_at', null
    );
  END IF;

  RETURN public.talkx_connection_send_budget(v_connection_id);
END;
$function$
