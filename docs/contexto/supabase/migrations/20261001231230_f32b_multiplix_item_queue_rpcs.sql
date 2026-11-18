CREATE OR REPLACE FUNCTION public.claim_multiplix_item(
  p_dispatch_id uuid,
  p_item_id uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE(
  item_id uuid,
  recipient_id uuid,
  block_id uuid,
  company_id uuid,
  claim_token uuid,
  claim_expires_at timestamp with time zone,
  delivery_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_item_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT item.id, item.recipient_id, item.block_id, recipient.company_id
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
      JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
     WHERE item.dispatch_id = p_dispatch_id
       AND item.id = p_item_id
       AND dispatch.status = 'sending'
       AND (
         item.status IN ('pending', 'failed_transient')
         OR (
           item.status = 'sending'
           AND item.lease_until <= statement_timestamp()
           AND item.provider_dispatch_started_at IS NULL
         )
       )
       -- Backoff da fila por item: sem isto um segundo worker pega o item antes da
       -- hora e o destinatario recebe o bloco duas vezes (F12 transportado ao item).
       AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= statement_timestamp())
     ORDER BY item.next_attempt_at NULLS FIRST, item.created_at, item.id
     FOR UPDATE OF item SKIP LOCKED
     LIMIT 1
  ), claimed AS (
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'sending',
           lease_token = gen_random_uuid(),
           lease_until = statement_timestamp() + make_interval(secs => p_lease_seconds),
           worker_id = p_worker,
           attempt_count = item.attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE item.id = candidate.id
    RETURNING item.id, item.recipient_id, item.block_id, item.lease_token,
              item.lease_until, item.attempt_count
  )
  SELECT claimed.id, claimed.recipient_id, claimed.block_id, candidate.company_id,
         claimed.lease_token, claimed.lease_until, claimed.attempt_count
  FROM claimed
  JOIN candidate ON candidate.id = claimed.id;
END;
$function$

REVOKE ALL ON FUNCTION public.claim_multiplix_item(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.claim_multiplix_item(uuid, uuid, text, integer) TO service_role

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

REVOKE ALL ON FUNCTION public.mark_multiplix_item_dispatch_started(uuid, uuid) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.mark_multiplix_item_dispatch_started(uuid, uuid) TO service_role

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

REVOKE ALL ON FUNCTION public.persist_multiplix_item_message_snapshot(uuid, uuid, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.persist_multiplix_item_message_snapshot(uuid, uuid, text) TO service_role

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

REVOKE ALL ON FUNCTION public.record_multiplix_item_sent(uuid, uuid, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.record_multiplix_item_sent(uuid, uuid, text) TO service_role

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

REVOKE ALL ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) TO service_role

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

REVOKE ALL ON FUNCTION public.release_multiplix_item_claim(uuid, uuid) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.release_multiplix_item_claim(uuid, uuid) TO service_role

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

REVOKE ALL ON FUNCTION public.reschedule_multiplix_item(uuid, uuid, timestamp with time zone, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.reschedule_multiplix_item(uuid, uuid, timestamp with time zone, text) TO service_role

CREATE OR REPLACE FUNCTION public.sweep_multiplix_stuck_items(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_swept      integer := 0;
  v_dispatches uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_multiplix_sweep_limit' USING ERRCODE = '22023';
  END IF;

  WITH stuck AS (
    SELECT item.id, item.dispatch_id
      FROM public.multiplix_delivery_items AS item
     WHERE item.status = 'sending'
       AND item.lease_until < statement_timestamp()
       AND item.provider_dispatch_started_at IS NOT NULL
     ORDER BY item.lease_until
     LIMIT p_limit
     FOR UPDATE OF item SKIP LOCKED
  ), swept AS (
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE item.id = stuck.id
    RETURNING item.dispatch_id
  )
  SELECT COALESCE(count(*), 0), COALESCE(array_agg(DISTINCT swept.dispatch_id), ARRAY[]::uuid[])
    INTO v_swept, v_dispatches
    FROM swept;

  -- Statement separado de proposito: dentro do mesmo statement os CTEs nao veem as
  -- linhas que os outros CTEs escrevem, e o recalc leria o valor antigo.
  IF v_swept > 0 THEN
    UPDATE public.multiplix_dispatches AS dispatch
       SET outcome_unknown_count = (
             SELECT count(*) FROM public.multiplix_delivery_items AS i
              WHERE i.dispatch_id = dispatch.id AND i.status = 'outcome_unknown'
           ),
           updated_at = statement_timestamp()
     WHERE dispatch.id = ANY (v_dispatches);
  END IF;

  RETURN v_swept;
END;
$function$

REVOKE ALL ON FUNCTION public.sweep_multiplix_stuck_items(integer) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.sweep_multiplix_stuck_items(integer) TO service_role

CREATE OR REPLACE FUNCTION public.record_multiplix_item_delivered(p_external_id text, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item_id     uuid;
  v_dispatch_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_ack' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  BEGIN
    SELECT item.id, item.dispatch_id
      INTO STRICT v_item_id, v_dispatch_id
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
     WHERE item.external_id = v_external_id
       AND item.delivered_at IS NULL
       AND dispatch.whatsapp_connection_id = p_connection_id
     FOR UPDATE OF item;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  UPDATE public.multiplix_delivery_items
     SET status = 'delivered',
         delivered_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = v_item_id;

  -- contador recalculado (idempotente) — ver §1 do cabecalho
  UPDATE public.multiplix_dispatches AS dispatch
     SET delivered_count = (
           SELECT count(*) FROM public.multiplix_delivery_items AS i
            WHERE i.dispatch_id = dispatch.id
              AND i.status IN ('delivered', 'read')
         ),
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;

  RETURN true;
END;
$function$

REVOKE ALL ON FUNCTION public.record_multiplix_item_delivered(text, uuid) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.record_multiplix_item_delivered(text, uuid) TO service_role

CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
  END IF;

  SELECT dispatch.status
    INTO v_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  -- `failed_transient` e o estado de retry da fila por item (§3 do cabecalho).
  IF EXISTS (
    SELECT 1
      FROM public.multiplix_delivery_items AS item
     WHERE item.dispatch_id = p_dispatch_id
       AND item.status IN ('pending', 'sending', 'failed_transient')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET status = CASE
           WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
           ELSE 'completed'
         END,
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE dispatch.id = p_dispatch_id
     AND dispatch.status = 'sending';

  RETURN FOUND;
END;
$function$

REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) TO service_role

COMMENT ON FUNCTION public.claim_multiplix_recipient(uuid, uuid, text, integer) IS
  'DEPRECATED (F32): usar claim_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.mark_multiplix_recipient_dispatch_started(uuid, uuid) IS
  'DEPRECATED (F32): usar mark_multiplix_item_dispatch_started - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.persist_multiplix_recipient_message_snapshot(uuid, uuid, text) IS
  'DEPRECATED (F32): usar persist_multiplix_item_message_snapshot - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.record_multiplix_recipient_sent(uuid, uuid, text) IS
  'DEPRECATED (F32): usar record_multiplix_item_sent - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.complete_multiplix_recipient(uuid, uuid, text, text) IS
  'DEPRECATED (F32): usar complete_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.release_multiplix_recipient_claim(uuid, uuid) IS
  'DEPRECATED (F32): usar release_multiplix_item_claim - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.reschedule_multiplix_recipient(uuid, uuid, timestamp with time zone, text) IS
  'DEPRECATED (F32): usar reschedule_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.record_multiplix_recipient_delivered(text, uuid) IS
  'DEPRECATED (F32): usar record_multiplix_item_delivered - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.sweep_multiplix_stuck_recipients(integer) IS
  'DEPRECATED (F32): usar sweep_multiplix_stuck_items - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'

COMMENT ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) IS
  'DEPRECATED (F32): usar complete_multiplix_dispatch_if_items_drained - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.'
