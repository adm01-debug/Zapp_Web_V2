CREATE OR REPLACE FUNCTION public.complete_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_status text, p_error_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_status IS NULL OR p_status NOT IN ('failed', 'skipped', 'outcome_unknown')
     OR length(COALESCE(p_error_message, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
  SET status = p_status,
      error_message = NULLIF(btrim(p_error_message), ''),
      delivery_claim_token = NULL,
      delivery_claimed_at = NULL,
      delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL,
      updated_at = statement_timestamp()
  WHERE recipient.id = p_recipient_id
    AND recipient.status = 'sending'
    AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.dispatch_id INTO v_dispatch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
  SET failed_count = dispatch.failed_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
      outcome_unknown_count = dispatch.outcome_unknown_count + CASE WHEN p_status = 'outcome_unknown' THEN 1 ELSE 0 END,
      updated_at = statement_timestamp()
  WHERE dispatch.id = v_dispatch_id;
END;
$function$
