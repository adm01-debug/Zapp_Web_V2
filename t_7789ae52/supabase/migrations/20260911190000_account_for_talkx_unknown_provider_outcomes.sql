-- Talk X: preserve the operational truth of a quarantined provider outcome in
-- campaign aggregates. The browser must not be able to fabricate this counter.

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS outcome_unknown_count integer NOT NULL DEFAULT 0;

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
  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
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

CREATE OR REPLACE FUNCTION public.complete_talkx_recipient(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped', 'outcome_unknown')
     OR length(COALESCE(p_error_message, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN statement_timestamp() ELSE recipient.sent_at END,
      error_message = CASE WHEN p_status = 'sent' THEN NULL ELSE NULLIF(btrim(p_error_message), '') END,
      delivery_claim_token = NULL,
      delivery_claimed_at = NULL,
      delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL,
      delivery_last_claim_token = p_claim_token,
      updated_at = statement_timestamp()
  WHERE recipient.id = p_recipient_id
    AND recipient.status = 'sending'
    AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.campaign_id INTO v_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
  SET sent_count = campaign.sent_count + CASE WHEN p_status = 'sent' THEN 1 ELSE 0 END,
      failed_count = campaign.failed_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
      outcome_unknown_count = campaign.outcome_unknown_count + CASE WHEN p_status = 'outcome_unknown' THEN 1 ELSE 0 END,
      updated_at = statement_timestamp()
  WHERE campaign.id = v_campaign_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  TO service_role;
