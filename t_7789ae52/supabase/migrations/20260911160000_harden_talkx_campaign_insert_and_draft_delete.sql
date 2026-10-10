-- Talk X: complete the authenticated-write boundary introduced in 20260911140000.
-- This is forward-only: it replaces trigger functions already installed by the
-- prior migration, without rewriting historical state.

CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Edge Functions authenticate as service_role and own delivery state. Browser
  -- writes remain limited by RLS and the invariants below.
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A browser creates only a draft. The snapshot RPC must populate recipients
    -- before a separate, authenticated update can schedule it.
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN
    RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023';
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
    -- The parent row is no longer visible while an ON DELETE CASCADE is being
    -- executed. Allow that single referential action; direct recipient deletes
    -- still find their parent and are rejected.
    IF TG_OP = 'DELETE'
       AND NOT EXISTS (
         SELECT 1 FROM public.talkx_campaigns
         WHERE id = OLD.campaign_id
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'talkx_recipient_snapshot_required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

DROP TRIGGER IF EXISTS enforce_talkx_recipient_snapshot_mutability ON public.talkx_recipients;
CREATE TRIGGER enforce_talkx_recipient_snapshot_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_recipient_snapshot_mutability();

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_talkx_recipient_snapshot_mutability() FROM PUBLIC;
