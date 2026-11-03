CREATE OR REPLACE FUNCTION public.confirm_talkx_campaign_launch(p_campaign_id uuid, p_expected_revision bigint, p_confirmations jsonb)
 RETURNS TABLE(campaign_id uuid, revision bigint, confirmed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_campaign   public.talkx_campaigns%ROWTYPE;
  v_profile_id uuid;
  v_now        timestamptz := statement_timestamp();
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_confirm_launch_unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
  LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_confirmable' USING ERRCODE = '55000';
  END IF;

  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- As 3 confirmacoes precisam estar presentes e verdadeiras.
  IF (p_confirmations -> 'consent')     IS DISTINCT FROM 'true'::jsonb
     OR (p_confirmations -> 'content')     IS DISTINCT FROM 'true'::jsonb
     OR (p_confirmations -> 'suppression') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'talkx_confirm_launch_missing_keys' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
  SET launch_confirmations = jsonb_build_object('consent', true, 'content', true, 'suppression', true),
      launch_confirmed_by  = v_profile_id,
      launch_confirmed_at  = v_now,
      launched_by          = COALESCE(campaign.launched_by, v_profile_id),
      launched_at          = COALESCE(campaign.launched_at, v_now),
      revision             = campaign.revision + 1,
      updated_at           = v_now
  WHERE campaign.id = v_campaign.id;

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision + 1, v_now;
END;
$function$
