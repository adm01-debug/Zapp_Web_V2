CREATE OR REPLACE FUNCTION public.log_talkx_campaign_checklist(p_campaign_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign_owner uuid;
  v_event_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 200 OR pg_column_size(p_items) > 16384 THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;

  SELECT campaign.created_by INTO v_campaign_owner
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign_owner IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'checklist', v_actor_profile_id, p_items::text)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$
