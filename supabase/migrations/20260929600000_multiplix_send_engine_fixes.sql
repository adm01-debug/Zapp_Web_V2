-- 20260929600000_multiplix_send_engine_fixes
-- Bloco A (F11b, F12, F13, F14) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Achados 13, 16, 17 e 18 da auditoria de 2026-09-29.
--
-- F12 — claim_multiplix_recipient ignorava retry_after (o filtro existia so na
-- edge): um segundo worker pegava item em backoff e duplicava o envio.
-- F13 — complete_multiplix_dispatch_if_drained marcava 'completed' com
-- failed_count/outcome_unknown_count > 0: disparo parcial aparecia como sucesso.
-- F14 — transition(cancel) deixava destinatarios 'pending' para sempre (o cron
-- nao esta mais pegando o dispatch) e nao registrava nada.
-- F11b — nao existia sweeper: item com provider_dispatch_started_at preenchido e
-- lease expirado (edge morta no meio do POST) ficava 'sending' eternamente, e o
-- claim nunca o recuperava de proposito (retry cego duplicaria envio). O sweeper
-- o move para 'outcome_unknown' — estado honesto, reconciliado por webhook (F58).
--
-- 'cancelled' (recipient) e 'completed_with_failures' (dispatch) entram nos
-- CHECKs nesta mesma migration para o novo caminho nao violar constraint.

-- === CHECKs de status ===
ALTER TABLE public.multiplix_recipients DROP CONSTRAINT IF EXISTS multiplix_recipients_status_check;
ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown', 'cancelled'));

ALTER TABLE public.multiplix_dispatches DROP CONSTRAINT IF EXISTS multiplix_dispatches_status_check;
ALTER TABLE public.multiplix_dispatches
  ADD CONSTRAINT multiplix_dispatches_status_check
    CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'completed_with_failures', 'failed', 'cancelled'));

-- === F12: claim honra retry_after ===
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
      -- Item em backoff nao volta para nenhum worker antes da hora: sem isto um
      -- segundo worker pega o item e o destinatario recebe duas mensagens.
      AND (recipient.retry_after IS NULL OR recipient.retry_after <= statement_timestamp())
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

-- === F13: parcial nunca aparece como concluido ===
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
$function$;

-- === F14: cancel encerra pendentes; start preserva a janela de 3 min ===
CREATE OR REPLACE FUNCTION public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text DEFAULT NULL::text)
 RETURNS TABLE(dispatch_id uuid, previous_status text, current_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_next_status text;
  v_closed integer := 0;
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
      IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN
        RAISE EXCEPTION 'multiplix_dispatch_already_running' USING ERRCODE = '55001';
      END IF;
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused', 'sending') THEN
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

  -- F14: cancelar tem de encerrar a fila. Item sem POST ao provedor vira
  -- 'cancelled' (com motivo explicito); item em voo (provider_dispatch_started_at
  -- preenchido) fica intacto — o resultado dele ainda e desconhecido e o sweeper
  -- (abaixo) resolve para outcome_unknown.
  IF p_action = 'cancel' THEN
    UPDATE public.multiplix_recipients AS recipient
       SET status = 'cancelled',
           error_message = COALESCE(recipient.error_message, 'Cancelado pelo operador antes do envio'),
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           retry_after = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
       AND recipient.provider_dispatch_started_at IS NULL;

    GET DIAGNOSTICS v_closed = ROW_COUNT;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(dispatch.started_at, statement_timestamp())
        ELSE dispatch.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE dispatch.paused_at END,
      completed_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE dispatch.completed_at END,
      updated_at   = statement_timestamp()
  WHERE dispatch.id = p_dispatch_id;

  RETURN QUERY SELECT p_dispatch_id, v_dispatch.status, v_next_status;
END;
$function$;

-- === F11b: sweeper de item preso ===
CREATE OR REPLACE FUNCTION public.sweep_multiplix_stuck_recipients(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_swept integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_multiplix_sweep_limit' USING ERRCODE = '22023';
  END IF;

  WITH stuck AS (
    SELECT recipient.id, recipient.dispatch_id
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.status = 'sending'
       AND recipient.delivery_claim_expires_at < statement_timestamp()
       AND recipient.provider_dispatch_started_at IS NOT NULL
     ORDER BY recipient.delivery_claim_expires_at
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  ), swept AS (
    UPDATE public.multiplix_recipients AS recipient
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE recipient.id = stuck.id
    RETURNING recipient.dispatch_id
  ), counted AS (
    SELECT swept.dispatch_id, count(*) AS n FROM swept GROUP BY swept.dispatch_id
  ), bumped AS (
    UPDATE public.multiplix_dispatches AS dispatch
       SET outcome_unknown_count = dispatch.outcome_unknown_count + counted.n,
           updated_at = statement_timestamp()
      FROM counted
     WHERE dispatch.id = counted.dispatch_id
    RETURNING dispatch.id
  )
  SELECT COALESCE(sum(counted.n), 0) INTO v_swept FROM counted;

  RETURN v_swept;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_multiplix_stuck_recipients(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_multiplix_stuck_recipients(integer) TO service_role;
