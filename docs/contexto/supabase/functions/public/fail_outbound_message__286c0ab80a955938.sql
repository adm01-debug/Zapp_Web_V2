CREATE OR REPLACE FUNCTION public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean DEFAULT false)
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
  IF p_message_id IS NULL OR p_claim_token IS NULL OR p_retryable IS NULL THEN
    RAISE EXCEPTION 'invalid_delivery_failure' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message.delivery_claim_token IS NULL
     AND v_message.delivery_last_claim_token = p_claim_token
     AND (
       (p_retryable AND v_message.status = 'sending')
       OR (NOT p_retryable AND v_message.status = 'failed')
     ) THEN
    RETURN v_message;
  END IF;

  IF v_message.sender IS DISTINCT FROM 'agent'
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL
     OR v_message.delivery_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET status = CASE WHEN p_retryable THEN 'sending' ELSE 'failed' END,
      status_updated_at = CASE WHEN p_retryable THEN status_updated_at
        ELSE statement_timestamp() END,
      delivery_claim_token = NULL, delivery_claimed_at = NULL,
      delivery_claim_expires_at = NULL, delivery_claimed_by = NULL,
      delivery_last_claim_token = p_claim_token, updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$
