CREATE OR REPLACE FUNCTION public.mark_multiplix_item_dispatch_started(p_item_id uuid, p_claim_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_provider_dispatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET provider_dispatch_started_at = COALESCE(item.provider_dispatch_started_at, statement_timestamp()),
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.status = 'sending'
     AND item.lease_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
END;
$function$
