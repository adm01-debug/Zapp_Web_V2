-- 20260926180000_multiplix_send_engine
-- Fase 2 do Multiplix: colunas e RPCs de claim/lease/backoff para o motor de
-- envio (multiplix-send), no mesmo padrao ja usado por talkx_recipients/
-- talkx_campaigns (claim_talkx_recipient, complete_talkx_recipient,
-- release_talkx_recipient_claim, reschedule_talkx_recipient,
-- complete_talkx_campaign_if_drained, transition_talkx_campaign,
-- mark_talkx_recipient_dispatch_started, persist_talkx_recipient_message_snapshot).
--
-- Diferencas deliberadas em relacao ao TalkX (fora de escopo aqui, nao
-- "esquecidas"): sem lista de supressao/opt-out (nao existe para Multiplix
-- ainda), sem variantes A/B de template (message_template e unico por
-- dispatch), sem link de rastreamento {{link}}. Midia (media_url/media_type)
-- vem direto de multiplix_dispatches em cada tentativa em vez de snapshot por
-- destinatario, porque nao ha variante que a troque no meio do envio.

ALTER TABLE public.multiplix_recipients
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN retry_after timestamp with time zone,
  ADD COLUMN provider_dispatch_started_at timestamp with time zone,
  ADD COLUMN external_id text;

ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_external_id_bounded
    CHECK (external_id IS NULL OR (length(btrim(external_id)) BETWEEN 1 AND 512));

ALTER TABLE public.multiplix_recipients
  DROP CONSTRAINT multiplix_recipients_status_check;

ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown'));

ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_delivery_claim_state
    CHECK (
      (status = 'sending' AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL
        AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL)
      OR
      (status <> 'sending' AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL
        AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)
    );

ALTER TABLE public.multiplix_dispatches
  ADD COLUMN outcome_unknown_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_multiplix_recipients_external_id ON public.multiplix_recipients(external_id) WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text DEFAULT NULL::text)
 RETURNS TABLE(dispatch_id uuid, previous_status text, current_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_next_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.multiplix_dispatches AS dispatch
  WHERE dispatch.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'start' THEN
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'multiplix_dispatch_start_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
        RAISE EXCEPTION 'multiplix_dispatch_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_dispatch.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.multiplix_recipients AS recipient
           WHERE recipient.dispatch_id = p_dispatch_id
         ) THEN
        RAISE EXCEPTION 'multiplix_dispatch_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
    WHEN 'pause' THEN
      IF v_dispatch.status <> 'sending' THEN
        RAISE EXCEPTION 'multiplix_dispatch_pause_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
    WHEN 'cancel' THEN
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'multiplix_dispatch_cancel_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
  END CASE;

  UPDATE public.multiplix_dispatches AS dispatch
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(dispatch.started_at, statement_timestamp())
        ELSE dispatch.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE dispatch.paused_at END,
      updated_at   = statement_timestamp()
  WHERE dispatch.id = p_dispatch_id;

  RETURN QUERY SELECT p_dispatch_id, v_dispatch.status, v_next_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_multiplix_recipient(p_dispatch_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS TABLE(recipient_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_recipient_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT recipient.id, recipient.company_id
    FROM public.multiplix_recipients AS recipient
    JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
    WHERE recipient.dispatch_id = p_dispatch_id
      AND recipient.id = p_recipient_id
      AND dispatch.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (
          recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp()
          AND recipient.provider_dispatch_started_at IS NULL
        )
      )
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.multiplix_recipients AS recipient
       SET status = 'sending',
           delivery_claim_token = gen_random_uuid(),
           delivery_claimed_at = statement_timestamp(),
           delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
           delivery_claimed_by = p_worker,
           delivery_attempt_count = recipient.delivery_attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE recipient.id = candidate.id
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.company_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.persist_multiplix_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text)
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
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_personalized_message IS NULL
     OR length(p_personalized_message) NOT BETWEEN 1 AND 65536 THEN
    RAISE EXCEPTION 'invalid_multiplix_recipient_message_snapshot' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
     SET personalized_message = COALESCE(recipient.personalized_message, p_personalized_message),
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.personalized_message INTO v_message;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_message;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_multiplix_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)
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
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_receipt' USING ERRCODE = '22023';
  END IF;

  -- Serializa recibos do mesmo provider_message_id sem assumir unicidade global
  -- entre instancias Evolution diferentes (mesmo padrao de record_talkx_recipient_sent).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  IF EXISTS (
    SELECT 1
    FROM public.multiplix_recipients AS duplicate
    WHERE duplicate.external_id = v_external_id
      AND duplicate.id <> p_recipient_id
  ) THEN
    RAISE EXCEPTION 'multiplix_provider_receipt_already_recorded' USING ERRCODE = '23505';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
     SET status = 'sent',
         sent_at = statement_timestamp(),
         external_id = v_external_id,
         error_message = NULL,
         delivery_claim_token = NULL,
         delivery_claimed_at = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by = NULL,
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
     AND recipient.provider_dispatch_started_at IS NOT NULL
  RETURNING recipient.dispatch_id INTO v_dispatch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET sent_count = dispatch.sent_count + 1,
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.release_multiplix_recipient_claim(p_recipient_id uuid, p_claim_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim_release' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
     SET status = 'pending',
         delivery_claim_token = NULL,
         delivery_claimed_at = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by = NULL,
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
     AND recipient.provider_dispatch_started_at IS NULL;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text DEFAULT NULL::text)
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
  UPDATE public.multiplix_recipients
  SET attempt_count             = attempt_count + 1,
      retry_after               = p_retry_after,
      error_message             = NULLIF(btrim(COALESCE(p_error_message, '')), ''),
      status                    = 'pending',
      delivery_claim_token      = NULL,
      delivery_claimed_at       = NULL,
      delivery_claim_expires_at = NULL,
      delivery_claimed_by       = NULL,
      updated_at                = statement_timestamp()
  WHERE id                      = p_recipient_id
    AND status                  = 'sending'
    AND delivery_claim_token    = p_claim_token
  RETURNING attempt_count, dispatch_id
  INTO v_attempt, v_dispatch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt >= 3 THEN
    UPDATE public.multiplix_recipients
    SET status = 'failed', retry_after = NULL, updated_at = statement_timestamp()
    WHERE id = p_recipient_id;
    UPDATE public.multiplix_dispatches
    SET failed_count = failed_count + 1, updated_at = statement_timestamp()
    WHERE id = v_dispatch;
    RETURN jsonb_build_object('action', 'dead_lettered', 'attempt', v_attempt);
  END IF;
  RETURN jsonb_build_object('action', 'rescheduled', 'attempt', v_attempt, 'retry_after', p_retry_after);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
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

  IF EXISTS (
    SELECT 1
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.multiplix_dispatches
     SET status = 'completed',
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_dispatch_id
     AND status = 'sending';

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_multiplix_dispatch(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_multiplix_recipient(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_multiplix_recipient_dispatch_started(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_multiplix_recipient_message_snapshot(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_multiplix_recipient_sent(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_multiplix_recipient(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_multiplix_recipient_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_multiplix_recipient(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_multiplix_dispatch(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_multiplix_recipient(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_multiplix_recipient_dispatch_started(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_multiplix_recipient_message_snapshot(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_multiplix_recipient_sent(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_recipient(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_multiplix_recipient_claim(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_multiplix_recipient(uuid, uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) TO service_role;
