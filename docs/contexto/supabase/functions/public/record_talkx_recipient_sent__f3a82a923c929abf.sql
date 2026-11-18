CREATE OR REPLACE FUNCTION public.record_talkx_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_campaign_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_receipt' USING ERRCODE = '22023';
  END IF;

  -- Serializes identical provider receipts without assuming that Evolution IDs
  -- are globally unique across every customer instance.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  IF EXISTS (
    SELECT 1
    FROM public.talkx_recipients AS duplicate
    WHERE duplicate.external_id = v_external_id
      AND duplicate.id <> p_recipient_id
  ) THEN
    RAISE EXCEPTION 'talkx_provider_receipt_already_recorded' USING ERRCODE = '23505';
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET status = 'sent',
         sent_at = statement_timestamp(),
         external_id = v_external_id,
         error_message = NULL,
         delivery_claim_token = NULL,
         delivery_claimed_at = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by = NULL,
         delivery_last_claim_token = p_claim_token,
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
     AND recipient.provider_dispatch_started_at IS NOT NULL
  RETURNING recipient.campaign_id INTO v_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
     SET sent_count = campaign.sent_count + 1,
         updated_at = statement_timestamp()
   WHERE campaign.id = v_campaign_id;
END;
$function$
