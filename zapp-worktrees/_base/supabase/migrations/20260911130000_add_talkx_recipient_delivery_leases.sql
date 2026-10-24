-- Talk X: leases transacionais por destinatário.
-- Impede que invocações concorrentes da Edge Function enviem duas vezes para o
-- mesmo contato; somente service_role pode reivindicar ou concluir um envio.

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS delivery_claim_token uuid,
  ADD COLUMN IF NOT EXISTS delivery_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_claimed_by text,
  ADD COLUMN IF NOT EXISTS delivery_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_last_claim_token uuid;

-- Linhas legadas em "sending" não tinham lease. Recolocá-las na fila é seguro:
-- evita uma linha presa e não afirma que um envio externo tenha sido concluído.
UPDATE public.talkx_recipients
SET status = 'pending',
    error_message = COALESCE(error_message, 'Recuperado de envio legado sem lease'),
    delivery_claim_token = NULL,
    delivery_claimed_at = NULL,
    delivery_claim_expires_at = NULL,
    delivery_claimed_by = NULL
WHERE status = 'sending'
  AND delivery_claim_token IS NULL;

ALTER TABLE public.talkx_recipients
  DROP CONSTRAINT IF EXISTS talkx_recipients_delivery_claim_state;
ALTER TABLE public.talkx_recipients
  ADD CONSTRAINT talkx_recipients_delivery_claim_state CHECK (
    (status = 'sending' AND delivery_claim_token IS NOT NULL
      AND delivery_claimed_at IS NOT NULL AND delivery_claim_expires_at IS NOT NULL
      AND delivery_claimed_by IS NOT NULL)
    OR
    (status <> 'sending' AND delivery_claim_token IS NULL
      AND delivery_claimed_at IS NULL AND delivery_claim_expires_at IS NULL
      AND delivery_claimed_by IS NULL)
  ) NOT VALID;
ALTER TABLE public.talkx_recipients
  VALIDATE CONSTRAINT talkx_recipients_delivery_claim_state;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_claimable
  ON public.talkx_recipients (campaign_id, created_at, id)
  WHERE status IN ('pending', 'sending');

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
    SELECT recipient.id
    FROM public.talkx_recipients AS recipient
    JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.campaign_id = p_campaign_id
      AND recipient.id = p_recipient_id
      AND campaign.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp())
      )
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.talkx_recipients AS recipient
    SET status = 'sending',
        delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = recipient.delivery_attempt_count + 1,
        updated_at = statement_timestamp()
    FROM candidate
    WHERE recipient.id = candidate.id
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.contact_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
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
     OR p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped')
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

REVOKE ALL ON FUNCTION public.claim_talkx_recipient(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_talkx_recipient(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text) TO service_role;
