-- Talk X: replace a draft/scheduled campaign audience atomically.
-- This is intentionally a forward-only primitive. The browser must not perform
-- delete/insert recipient synchronization in separate requests.

CREATE OR REPLACE FUNCTION public.replace_talkx_draft_recipients(
  p_campaign_id uuid,
  p_contact_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_profile_id uuid;
  v_contact_ids uuid[];
  v_requested_count integer;
  v_visible_count integer;
  v_recipient_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL OR p_contact_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_snapshot' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_contact_ids) AS requested(id) WHERE requested.id IS NULL) THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_id' USING ERRCODE = '22023';
  END IF;

  SELECT profile.id
    INTO v_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND
     OR (v_campaign.created_by IS DISTINCT FROM v_profile_id
         AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE) THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested.id ORDER BY requested.id), ARRAY[]::uuid[])
    INTO v_contact_ids
    FROM unnest(p_contact_ids) AS requested(id);
  v_requested_count := cardinality(v_contact_ids);

  SELECT count(*)::integer
    INTO v_visible_count
    FROM public.contacts AS contact
   WHERE contact.id = ANY(v_contact_ids)
     AND public.is_contact_visible_to_user(contact.id, auth.uid()) IS TRUE;

  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'talkx_recipient_not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id)
  SELECT p_campaign_id, requested.id
    FROM unnest(v_contact_ids) AS requested(id);

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_recipient_count,
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id;

  RETURN v_recipient_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  TO authenticated;
