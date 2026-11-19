CREATE OR REPLACE FUNCTION public.reschedule_multiplix_item(p_item_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_attempt   integer;
  v_dispatch  uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  -- NAO incrementa attempt_count: o claim ja incrementou esta tentativa (§2 do
  -- cabecalho). Incrementar aqui contaria a mesma tentativa duas vezes.
  UPDATE public.multiplix_delivery_items
  SET next_attempt_at          = p_retry_after,
      error_message            = NULLIF(btrim(COALESCE(p_error_message, '')), ''),
      status                   = 'pending',
      lease_token              = NULL,
      lease_until              = NULL,
      worker_id                = NULL,
      updated_at               = statement_timestamp()
  WHERE id                     = p_item_id
    AND status                 = 'sending'
    AND lease_token            = p_claim_token
  RETURNING attempt_count, dispatch_id
  INTO v_attempt, v_dispatch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt >= 3 THEN
    UPDATE public.multiplix_delivery_items
    SET status = 'failed', next_attempt_at = NULL, updated_at = statement_timestamp()
    WHERE id = p_item_id;
    -- contador recalculado (idempotente) — ver §1 do cabecalho
    UPDATE public.multiplix_dispatches AS dispatch
    SET failed_count = (
          SELECT count(*) FROM public.multiplix_delivery_items AS i
           WHERE i.dispatch_id = dispatch.id AND i.status = 'failed'
        ),
        updated_at = statement_timestamp()
    WHERE dispatch.id = v_dispatch;
    RETURN jsonb_build_object('action', 'dead_lettered', 'attempt', v_attempt);
  END IF;
  RETURN jsonb_build_object('action', 'rescheduled', 'attempt', v_attempt, 'retry_after', p_retry_after);
END;
$function$
