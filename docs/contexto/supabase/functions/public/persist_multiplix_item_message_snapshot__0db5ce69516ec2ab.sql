CREATE OR REPLACE FUNCTION public.persist_multiplix_item_message_snapshot(p_item_id uuid, p_claim_token uuid, p_personalized_message text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR p_personalized_message IS NULL
     OR length(p_personalized_message) NOT BETWEEN 1 AND 65536 THEN
    RAISE EXCEPTION 'invalid_multiplix_item_message_snapshot' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET personalized_message = COALESCE(item.personalized_message, p_personalized_message),
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.status = 'sending'
     AND item.lease_token = p_claim_token
  RETURNING item.personalized_message INTO v_message;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_message;
END;
$function$
