-- Atomic delivery for message kinds that need structured transport data while
-- keeping a human-readable `content` value for the chat timeline.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.enqueue_rich_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_display_content text,
  p_message_type text,
  p_delivery_payload jsonb,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
  v_payload jsonb := p_delivery_payload;
  v_option_count integer;
  v_selectable_count integer;
BEGIN
  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_display_content IS NULL OR length(p_display_content) > 65536
     OR p_message_type NOT IN ('poll', 'contact')
     OR v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
     OR pg_column_size(v_payload) > 16384 THEN
    RAISE EXCEPTION 'invalid_rich_outbound_message' USING ERRCODE = '22023';
  END IF;

  IF p_message_type = 'poll' THEN
    IF jsonb_typeof(v_payload->'name') <> 'string'
       OR length(v_payload->>'name') NOT BETWEEN 1 AND 1024
       OR jsonb_typeof(v_payload->'values') <> 'array' THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_option_count FROM jsonb_array_elements_text(v_payload->'values');
    IF v_option_count NOT BETWEEN 2 AND 12
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_payload->'values') AS option_value
         WHERE length(btrim(option_value)) NOT BETWEEN 1 AND 256
       ) THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_selectable_count := (v_payload->>'selectableCount')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END;
    IF v_selectable_count NOT BETWEEN 1 AND v_option_count THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF jsonb_typeof(v_payload->'fullName') <> 'string'
       OR length(v_payload->>'fullName') NOT BETWEEN 1 AND 512
       OR jsonb_typeof(v_payload->'phoneNumber') <> 'string'
       OR regexp_replace(v_payload->>'phoneNumber', '\\D', '', 'g') !~ '^[0-9]{8,15}$'
       OR (v_payload ? 'organization' AND (
         jsonb_typeof(v_payload->'organization') <> 'string'
         OR length(v_payload->>'organization') > 512
       ))
       OR (v_payload ? 'email' AND (
         jsonb_typeof(v_payload->'email') <> 'string'
         OR length(v_payload->>'email') > 320
       )) THEN
      RAISE EXCEPTION 'invalid_contact_card_payload' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Serialize check-and-enqueue for the idempotency key. Without this lock a
  -- concurrent base enqueue could observe its temporary text row mid-upgrade.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text || ':' || p_client_message_id::text, 0));

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.contact_id = p_contact_id
    AND message.client_message_id = p_client_message_id;
  IF FOUND THEN
    IF v_message.sender = 'agent'
       AND v_message.content = p_display_content
       AND v_message.message_type = p_message_type
       AND v_message.reply_to_id IS NOT DISTINCT FROM p_reply_to_id
       AND v_message.media_meta->'outbound_delivery_payload' = v_payload THEN
      RETURN v_message;
    END IF;
    RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
      USING ERRCODE = '23505';
  END IF;

  -- Reuse the canonical authorization, profile, connection and reply checks.
  PERFORM public.enqueue_outbound_message(
    p_contact_id,
    p_client_message_id,
    p_display_content,
    'text',
    NULL,
    p_reply_to_id,
    p_whatsapp_connection_id
  );

  UPDATE public.messages
  SET message_type = p_message_type,
      media_meta = jsonb_build_object('outbound_delivery_payload', v_payload),
      updated_at = statement_timestamp()
  WHERE contact_id = p_contact_id
    AND client_message_id = p_client_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_rich_outbound_message(
  uuid, uuid, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_rich_outbound_message(
  uuid, uuid, text, text, jsonb, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.enqueue_rich_outbound_message(
  uuid, uuid, text, text, jsonb, uuid, uuid
) IS 'Authorized idempotent enqueue for poll/contact messages; transport payload is immutable after claim.';

COMMIT;
