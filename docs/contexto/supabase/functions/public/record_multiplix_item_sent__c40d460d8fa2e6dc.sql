CREATE OR REPLACE FUNCTION public.record_multiplix_item_sent(p_item_id uuid, p_claim_token uuid, p_external_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_receipt' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  IF EXISTS (
    SELECT 1
    FROM public.multiplix_delivery_items AS duplicate
    WHERE duplicate.external_id = v_external_id
      AND duplicate.id <> p_item_id
  ) THEN
    RAISE EXCEPTION 'multiplix_provider_receipt_already_recorded' USING ERRCODE = '23505';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET status = 'sent',
         sent_at = statement_timestamp(),
         external_id = v_external_id,
         error_message = NULL,
         error_class = NULL,
         lease_token = NULL,
         lease_until = NULL,
         worker_id = NULL,
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.status = 'sending'
     AND item.lease_token = p_claim_token
     AND item.provider_dispatch_started_at IS NOT NULL
  RETURNING item.dispatch_id INTO v_dispatch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- contador recalculado (idempotente) — ver §1 do cabecalho
  UPDATE public.multiplix_dispatches AS dispatch
     SET sent_count = (
           SELECT count(*) FROM public.multiplix_delivery_items AS i
            WHERE i.dispatch_id = dispatch.id
              AND i.status IN ('sent', 'delivered', 'read')
         ),
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;
END;
$function$
