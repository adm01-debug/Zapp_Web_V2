CREATE OR REPLACE FUNCTION public.multiplix_materialize_legacy_queue(p_dispatch_id uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(items_created integer, items_total integer, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_existing integer;
  v_blocks   integer;
  v_eligible integer;
  v_created  integer;
  v_block_created boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_materialize' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch
    FROM public.multiplix_dispatches AS d
   WHERE d.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO v_existing
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  IF v_existing > 0 OR v_dispatch.status <> 'sending' THEN
    RETURN QUERY SELECT 0, v_existing, false;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_blocks
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  IF v_blocks = 0 THEN
    IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
      RAISE EXCEPTION 'multiplix_legacy_empty_template' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, content)
    VALUES (
      p_dispatch_id,
      1,
      'text',
      jsonb_build_object('text', v_dispatch.message_template)
    );
    v_blocks := 1;
    v_block_created := true;
  END IF;

  SELECT count(*)::integer INTO v_eligible
    FROM public.multiplix_recipients AS r
   WHERE r.dispatch_id = p_dispatch_id
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL);

  INSERT INTO public.multiplix_delivery_items AS item (
    dispatch_id, recipient_id, block_id, dispatch_version, status
  )
  SELECT p_dispatch_id, r.id, b.id, v_dispatch.dispatch_version, 'pending'
    FROM public.multiplix_recipients AS r
    CROSS JOIN public.multiplix_blocks AS b
   WHERE r.dispatch_id = p_dispatch_id
     AND b.dispatch_id = p_dispatch_id
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  IF v_block_created OR v_created > 0 THEN
    INSERT INTO public.multiplix_events (dispatch_id, kind, payload, correlation_id)
    VALUES (
      p_dispatch_id,
      'item_queued',
      jsonb_build_object(
        'items_created', v_created,
        'recipients', v_eligible,
        'blocks', v_blocks
      ),
      p_correlation_id
    );
  END IF;

  RETURN QUERY SELECT v_created, v_created, (v_block_created OR v_created > 0);
END;
$function$
