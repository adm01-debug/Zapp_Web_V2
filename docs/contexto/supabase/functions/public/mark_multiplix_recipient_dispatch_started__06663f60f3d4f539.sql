CREATE OR REPLACE FUNCTION public.mark_multiplix_recipient_dispatch_started(p_recipient_id uuid, p_claim_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_provider_dispatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
     SET provider_dispatch_started_at = COALESCE(recipient.provider_dispatch_started_at, statement_timestamp()),
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
END;
$function$
