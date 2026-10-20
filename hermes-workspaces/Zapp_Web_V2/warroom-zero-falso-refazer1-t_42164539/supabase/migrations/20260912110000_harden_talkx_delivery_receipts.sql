-- Talk X: preserve the provider receipt and delivery acknowledgement in the
-- same transaction as campaign counters.  A webhook must never mark a
-- recipient delivered and then fail before incrementing the campaign metric.

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provider_dispatch_started_at timestamptz;

ALTER TABLE public.talkx_recipients
  DROP CONSTRAINT IF EXISTS talkx_recipients_external_id_bounded;
ALTER TABLE public.talkx_recipients
  ADD CONSTRAINT talkx_recipients_external_id_bounded
    CHECK (external_id IS NULL OR length(btrim(external_id)) BETWEEN 1 AND 512)
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_external_id
  ON public.talkx_recipients (external_id)
  WHERE external_id IS NOT NULL;

-- This check is intentionally centralized in Postgres: a sender may hold a
-- recipient lease while the contact opts out. Comparing formatted phone text
-- in an Edge Function snapshot is not sufficient to protect that race.
CREATE OR REPLACE FUNCTION public.talkx_recipient_is_suppressed(
  p_contact_id uuid,
  p_phone text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.talkx_blacklist AS blacklist
    WHERE blacklist.removed_at IS NULL
      AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
      AND (
        blacklist.contact_id = p_contact_id
        OR (
          NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
          AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
        )
      )
  );
END;
$function$;

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
     AND recipient.delivery_claim_token = p_claim_token
     AND recipient.provider_dispatch_started_at IS NULL;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_talkx_recipient_dispatch_started(
  p_recipient_id uuid,
  p_claim_token uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_provider_dispatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET provider_dispatch_started_at = COALESCE(recipient.provider_dispatch_started_at, statement_timestamp()),
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_talkx_recipient(
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  recipient_id uuid,
  contact_id uuid,
  claim_token uuid,
  claim_expires_at timestamptz,
  delivery_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_recipient_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT recipient.id, recipient.contact_id
    FROM public.talkx_recipients AS recipient
    JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.campaign_id = p_campaign_id
      AND recipient.id = p_recipient_id
      AND campaign.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (
          recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp()
          AND recipient.provider_dispatch_started_at IS NULL
        )
      )
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), blocked AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'skipped',
           error_message = 'Contato na lista negra (opt-out)',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM candidate
      LEFT JOIN public.contacts AS contact ON contact.id = candidate.contact_id
     WHERE recipient.id = candidate.id
       AND EXISTS (
         SELECT 1
         FROM public.talkx_blacklist AS blacklist
         WHERE blacklist.removed_at IS NULL
           AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
           AND (
             blacklist.contact_id = candidate.contact_id
             OR (
               NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
               AND contact.id IS NOT NULL
               AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g')
             )
           )
       )
    RETURNING recipient.id
  ), claimed AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'sending',
           delivery_claim_token = gen_random_uuid(),
           delivery_claimed_at = statement_timestamp(),
           delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
           delivery_claimed_by = p_worker,
           delivery_attempt_count = recipient.delivery_attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE recipient.id = candidate.id
       AND NOT EXISTS (SELECT 1 FROM blocked)
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.contact_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_recipient_sent(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_talkx_recipient_delivered(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_talkx_recipient_claim(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_talkx_recipient_dispatch_started(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talkx_recipient_is_suppressed(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talkx_increment_delivered(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_sent(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_delivered(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_talkx_recipient_claim(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_talkx_recipient_dispatch_started(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.talkx_recipient_is_suppressed(uuid, text)
  TO service_role;
