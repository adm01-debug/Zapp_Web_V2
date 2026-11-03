CREATE OR REPLACE FUNCTION public.release_multiplix_item_claim(p_item_id uuid, p_claim_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim_release' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET status = 'pending',
         lease_token = NULL,
         lease_until = NULL,
         worker_id = NULL,
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.status = 'sending'
     AND item.lease_token = p_claim_token
     AND item.provider_dispatch_started_at IS NULL;

  RETURN FOUND;
END;
$function$
