-- Talk X: the browser may edit a draft, but it must not manufacture delivery
-- state, counters or recipient rows.  Recipient snapshots remain atomic through
-- the audited RPC below; the Edge Function (service_role) owns delivery state.

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

  -- This transaction-scoped marker is consumed by the table triggers below.
  -- It is not supplied by the client and resets automatically at transaction end.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

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

CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- The Edge Function authenticates as service_role and is the only component
  -- allowed to move delivery state or update delivery counters.
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'scheduled' AND NEW.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_timestamp' USING ERRCODE = '22023';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_talkx_recipient_snapshot_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') = 'authenticated'
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_snapshot_required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

DROP TRIGGER IF EXISTS enforce_talkx_recipient_snapshot_mutability ON public.talkx_recipients;
CREATE TRIGGER enforce_talkx_recipient_snapshot_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_recipient_snapshot_mutability();

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_talkx_recipient_snapshot_mutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[]) TO authenticated;
