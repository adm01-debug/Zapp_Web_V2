CREATE OR REPLACE FUNCTION public.complete_multiplix_item(p_item_id uuid, p_claim_token uuid, p_status text, p_error_message text DEFAULT NULL::text)
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
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR p_status IS NULL OR p_status NOT IN ('failed', 'skipped', 'outcome_unknown')
     OR length(COALESCE(p_error_message, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
  SET status = p_status::public.multiplix_item_status,
      error_message = NULLIF(btrim(p_error_message), ''),
      lease_token = NULL,
      lease_until = NULL,
      worker_id = NULL,
      updated_at = statement_timestamp()
  WHERE item.id = p_item_id
    AND item.status = 'sending'
    AND item.lease_token = p_claim_token
  RETURNING item.dispatch_id INTO v_dispatch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- contadores recalculados (idempotente) — ver §1 do cabecalho
  UPDATE public.multiplix_dispatches AS dispatch
  SET failed_count = (
        SELECT count(*) FROM public.multiplix_delivery_items AS i
         WHERE i.dispatch_id = dispatch.id AND i.status = 'failed'
      ),
      outcome_unknown_count = (
        SELECT count(*) FROM public.multiplix_delivery_items AS i
         WHERE i.dispatch_id = dispatch.id AND i.status = 'outcome_unknown'
      ),
      updated_at = statement_timestamp()
  WHERE dispatch.id = v_dispatch_id;
END;
$function$
