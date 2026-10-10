-- Talk X: a scheduled timestamp is stored in UTC, but the operator's IANA
-- timezone is part of the scheduling contract. Without it, the send window
-- and business-hours guard could be evaluated in a different location.

CREATE OR REPLACE FUNCTION public.is_valid_talkx_schedule_timezone(p_timezone text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT p_timezone IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_timezone_names AS timezone
       WHERE timezone.name = p_timezone
     );
$function$;

REVOKE ALL ON FUNCTION public.is_valid_talkx_schedule_timezone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_talkx_schedule_timezone(text) TO authenticated, service_role;

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS schedule_timezone text;

-- Historical schedules had an implicit Brazil/São Paulo policy in the worker.
-- Preserve that policy explicitly; do not reinterpret their UTC instant.
UPDATE public.talkx_campaigns
   SET schedule_timezone = 'America/Sao_Paulo'
 WHERE schedule_timezone IS NULL;

ALTER TABLE public.talkx_campaigns
  ALTER COLUMN schedule_timezone SET DEFAULT 'America/Sao_Paulo',
  ALTER COLUMN schedule_timezone SET NOT NULL;

ALTER TABLE public.talkx_campaigns
  DROP CONSTRAINT IF EXISTS talkx_campaigns_schedule_timezone_valid,
  DROP CONSTRAINT IF EXISTS talkx_campaigns_send_window_valid;

ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_schedule_timezone_valid
    CHECK (public.is_valid_talkx_schedule_timezone(schedule_timezone)) NOT VALID,
  ADD CONSTRAINT talkx_campaigns_send_window_valid
    CHECK (
      (send_window_start IS NULL AND send_window_end IS NULL)
      OR (
        send_window_start IS NOT NULL
        AND send_window_end IS NOT NULL
        AND send_window_start < send_window_end
      )
    ) NOT VALID;

-- `NOT VALID` constraints are enforced for every write made after this
-- migration, while allowing a separately-audited validation of historical
-- rows.  Validating blindly here could turn an unrelated legacy row into a
-- deployment outage.  The canonical deployment runbook must first record a
-- zero-row preflight before issuing `VALIDATE CONSTRAINT`.

-- Keep the browser from scheduling an already elapsed instant through a direct
-- table update. The service-role transition to `sending` remains unaffected.
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
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

  IF NEW.status = 'scheduled'
     AND NEW.scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON COLUMN public.talkx_campaigns.schedule_timezone IS
  'IANA timezone selected by the operator; controls display, send window and business-hours evaluation.';
