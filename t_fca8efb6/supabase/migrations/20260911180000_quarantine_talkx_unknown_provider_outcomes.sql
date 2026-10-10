-- Talk X: a provider timeout/5xx after a POST is not evidence that no message
-- was accepted. Quarantine that recipient instead of letting an expired lease
-- turn an ambiguous delivery into an automatic duplicate send.

ALTER TABLE public.talkx_recipients
  DROP CONSTRAINT IF EXISTS talkx_recipients_status_check;
ALTER TABLE public.talkx_recipients
  ADD CONSTRAINT talkx_recipients_status_check CHECK (
    status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown')
  ) NOT VALID;
ALTER TABLE public.talkx_recipients
  VALIDATE CONSTRAINT talkx_recipients_status_check;

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
      updated_at = statement_timestamp()
  WHERE campaign.id = v_campaign_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  TO service_role;
