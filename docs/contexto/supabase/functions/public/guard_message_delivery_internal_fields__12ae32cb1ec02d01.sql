CREATE OR REPLACE FUNCTION public.guard_message_delivery_internal_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND (
        NEW.client_message_id IS NOT NULL
        OR NEW.delivery_claim_token IS NOT NULL
        OR NEW.delivery_claimed_at IS NOT NULL
        OR NEW.delivery_claim_expires_at IS NOT NULL
        OR NEW.delivery_claimed_by IS NOT NULL
        OR NEW.delivery_last_claim_token IS NOT NULL
        OR NEW.delivery_attempt_count <> 0
      ))
     OR (TG_OP = 'UPDATE' AND (
        NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
        OR NEW.delivery_claim_token IS DISTINCT FROM OLD.delivery_claim_token
        OR NEW.delivery_claimed_at IS DISTINCT FROM OLD.delivery_claimed_at
        OR NEW.delivery_claim_expires_at IS DISTINCT FROM OLD.delivery_claim_expires_at
        OR NEW.delivery_claimed_by IS DISTINCT FROM OLD.delivery_claimed_by
        OR NEW.delivery_last_claim_token IS DISTINCT FROM OLD.delivery_last_claim_token
        OR NEW.delivery_attempt_count IS DISTINCT FROM OLD.delivery_attempt_count
      )) THEN
    RAISE EXCEPTION 'message_delivery_internal_fields_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.client_message_id IS NOT NULL
     AND OLD.status = 'sending'
     AND OLD.external_id IS NULL
     AND (
       NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.caption IS DISTINCT FROM OLD.caption
       OR NEW.media_filename IS DISTINCT FROM OLD.media_filename
       OR NEW.media_mimetype IS DISTINCT FROM OLD.media_mimetype
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.media_size IS DISTINCT FROM OLD.media_size
       OR NEW.media_meta IS DISTINCT FROM OLD.media_meta
       OR NEW.ptt IS DISTINCT FROM OLD.ptt
       OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
       OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
     ) THEN
    RAISE EXCEPTION 'message_delivery_payload_immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
