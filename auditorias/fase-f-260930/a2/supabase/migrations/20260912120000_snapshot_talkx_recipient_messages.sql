-- Talk X: an A/B recipient must retain the exact content and media selected
-- for its first delivery attempt.  `variant_id` alone is mutable because a
-- template variant can be edited or deleted after the campaign starts.

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS variant_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS message_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_url_snapshot text,
  ADD COLUMN IF NOT EXISTS media_type_snapshot text;

-- Preserve historical attribution before a variant's foreign key can be
-- cleared by ON DELETE SET NULL.  This has no dependency on a live variant.
UPDATE public.talkx_recipients
   SET variant_id_snapshot = variant_id
 WHERE variant_id_snapshot IS NULL
   AND variant_id IS NOT NULL;

ALTER TABLE public.talkx_recipients
  DROP CONSTRAINT IF EXISTS talkx_recipients_media_snapshot_shape;
ALTER TABLE public.talkx_recipients
  ADD CONSTRAINT talkx_recipients_media_snapshot_shape
  CHECK (
    (media_url_snapshot IS NULL AND media_type_snapshot IS NULL)
    OR (
      length(btrim(media_url_snapshot)) BETWEEN 1 AND 8192
      AND media_type_snapshot IN ('image', 'video', 'document', 'audio')
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.persist_talkx_recipient_message_snapshot(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_personalized_message text,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_variant_id uuid DEFAULT NULL
) RETURNS TABLE(
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  variant_id_snapshot uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_row public.talkx_recipients%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_personalized_message IS NULL
     OR length(p_personalized_message) NOT BETWEEN 1 AND 65536
     OR (p_media_url IS NULL) IS DISTINCT FROM (p_media_type IS NULL)
     OR (p_media_url IS NOT NULL AND length(btrim(p_media_url)) NOT BETWEEN 1 AND 8192)
     OR (p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video', 'document', 'audio')) THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_message_snapshot' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET personalized_message = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_personalized_message
           ELSE recipient.personalized_message
         END,
         media_url_snapshot = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN NULLIF(btrim(p_media_url), '')
           ELSE recipient.media_url_snapshot
         END,
         media_type_snapshot = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_media_type
           ELSE recipient.media_type_snapshot
         END,
         variant_id = COALESCE(recipient.variant_id, p_variant_id),
         variant_id_snapshot = COALESCE(recipient.variant_id_snapshot, recipient.variant_id, p_variant_id),
         message_snapshot_at = COALESCE(recipient.message_snapshot_at, statement_timestamp()),
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT v_row.personalized_message,
         v_row.media_url_snapshot,
         v_row.media_type_snapshot,
         v_row.variant_id_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_talkx_recipient_message_snapshot(uuid, uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_talkx_recipient_message_snapshot(uuid, uuid, text, text, text, uuid)
  TO service_role;
