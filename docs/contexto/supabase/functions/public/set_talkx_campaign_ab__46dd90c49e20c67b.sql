-- pg_get_functiondef snapshot of public.set_talkx_campaign_ab(uuid, bigint, boolean, text, integer)

CREATE OR REPLACE FUNCTION public.set_talkx_campaign_ab(p_campaign_id uuid, p_expected_revision bigint, p_ab_enabled boolean, p_ab_metric text DEFAULT 'reply_rate'::text, p_ab_min_sample integer DEFAULT 50)
 RETURNS TABLE(campaign_id uuid, revision bigint, ab_enabled boolean, ab_metric text, ab_min_sample integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_metric text;
  v_min    integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true
   LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_ab' USING ERRCODE = '22023';
  END IF;

  v_metric := COALESCE(NULLIF(btrim(p_ab_metric), ''), 'reply_rate');
  IF v_metric NOT IN ('reply_rate', 'click_rate', 'delivery_rate') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_ab' USING ERRCODE = '22023';
  END IF;

  v_min := LEAST(GREATEST(COALESCE(p_ab_min_sample, 50), 1), 1000000);

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_ab_locked' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
     SET ab_enabled    = COALESCE(p_ab_enabled, false),
         ab_metric     = v_metric,
         ab_min_sample = v_min,
         revision      = campaign.revision + 1,
         updated_at    = statement_timestamp()
   WHERE campaign.id = p_campaign_id
  RETURNING campaign.* INTO v_campaign;

  RETURN QUERY
  SELECT v_campaign.id, v_campaign.revision, v_campaign.ab_enabled,
         v_campaign.ab_metric, v_campaign.ab_min_sample;
END;
$function$
