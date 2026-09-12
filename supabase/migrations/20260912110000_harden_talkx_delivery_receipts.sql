-- Talk X: preserve the provider receipt and delivery acknowledgement in the
-- same transaction as campaign counters.  A webhook must never mark a
-- recipient delivered and then fail before incrementing the campaign metric.

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE public.talkx_recipients
  DROP CONSTRAINT IF EXISTS talkx_recipients_external_id_bounded;
ALTER TABLE public.talkx_recipients
  ADD CONSTRAINT talkx_recipients_external_id_bounded
    CHECK (external_id IS NULL OR length(btrim(external_id)) BETWEEN 1 AND 512)
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_external_id
  ON public.talkx_recipients (external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_talkx_recipient_sent(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_external_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  RETURNING recipient.campaign_id INTO v_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
     SET sent_count = campaign.sent_count + 1,
         updated_at = statement_timestamp()
   WHERE campaign.id = v_campaign_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_talkx_recipient_delivered(
  p_external_id text,
  p_connection_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_ack' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  BEGIN
    SELECT recipient.id, recipient.campaign_id
      INTO STRICT v_recipient_id, v_campaign_id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE recipient.external_id = v_external_id
       AND recipient.delivered_at IS NULL
       AND campaign.whatsapp_connection_id = p_connection_id
     FOR UPDATE OF recipient;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  UPDATE public.talkx_recipients
     SET status = 'delivered',
         delivered_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = v_recipient_id;

  UPDATE public.talkx_campaigns AS campaign
     SET delivered_count = campaign.delivered_count + 1,
         updated_at = statement_timestamp()
   WHERE campaign.id = v_campaign_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_talkx_recipient_claim(
  p_recipient_id uuid,
  p_claim_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_claim_release' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET status = 'pending',
         delivery_claim_token = NULL,
         delivery_claimed_at = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by = NULL,
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_recipient_sent(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_talkx_recipient_delivered(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_talkx_recipient_claim(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talkx_increment_delivered(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_sent(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_delivered(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_talkx_recipient_claim(uuid, uuid)
  TO service_role;
