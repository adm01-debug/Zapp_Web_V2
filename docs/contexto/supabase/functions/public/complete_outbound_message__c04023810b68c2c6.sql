CREATE OR REPLACE FUNCTION public.complete_outbound_message(p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text DEFAULT 'sent'::text)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL
     OR length(btrim(COALESCE(p_external_id, ''))) NOT BETWEEN 1 AND 512
     OR p_delivery_status IS NULL
     OR p_delivery_status NOT IN ('sent', 'delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_delivery_completion' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message.external_id = btrim(p_external_id)
     AND v_message.status IN ('sent', 'delivered', 'read')
     AND v_message.delivery_claim_token IS NULL
     AND v_message.delivery_last_claim_token = p_claim_token THEN
    RETURN v_message;
  END IF;

  IF v_message.delivery_claim_token IS DISTINCT FROM p_claim_token
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET external_id = btrim(p_external_id), status = p_delivery_status,
      status_updated_at = statement_timestamp(), delivery_claim_token = NULL,
      delivery_claimed_at = NULL, delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL, delivery_last_claim_token = p_claim_token,
      updated_at = statement_timestamp()
  WHERE id = p_message_id RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$
