-- f32b_multiplix_item_queue_rpcs
-- versão 20261001231230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:25-03:00 (hermes-db-migrar --nova)

-- rollback: DROP FUNCTION IF EXISTS public.complete_multiplix_dispatch_if_items_drained(uuid);
-- rollback: DROP FUNCTION IF EXISTS public.sweep_multiplix_stuck_items(integer);
-- rollback: DROP FUNCTION IF EXISTS public.record_multiplix_item_delivered(text, uuid);
-- rollback: DROP FUNCTION IF EXISTS public.reschedule_multiplix_item(uuid, uuid, timestamp with time zone, text);
-- rollback: DROP FUNCTION IF EXISTS public.release_multiplix_item_claim(uuid, uuid);
-- rollback: DROP FUNCTION IF EXISTS public.complete_multiplix_item(uuid, uuid, text, text);
-- rollback: DROP FUNCTION IF EXISTS public.record_multiplix_item_sent(uuid, uuid, text);
-- rollback: DROP FUNCTION IF EXISTS public.persist_multiplix_item_message_snapshot(uuid, uuid, text);
-- rollback: DROP FUNCTION IF EXISTS public.mark_multiplix_item_dispatch_started(uuid, uuid);
-- rollback: DROP FUNCTION IF EXISTS public.claim_multiplix_item(uuid, uuid, text, integer);
-- rollback: COMMENT ON FUNCTION public.claim_multiplix_recipient(uuid, uuid, text, integer) IS NULL;
-- rollback: COMMENT ON FUNCTION public.mark_multiplix_recipient_dispatch_started(uuid, uuid) IS NULL;
-- rollback: COMMENT ON FUNCTION public.persist_multiplix_recipient_message_snapshot(uuid, uuid, text) IS NULL;
-- rollback: COMMENT ON FUNCTION public.record_multiplix_recipient_sent(uuid, uuid, text) IS NULL;
-- rollback: COMMENT ON FUNCTION public.complete_multiplix_recipient(uuid, uuid, text, text) IS NULL;
-- rollback: COMMENT ON FUNCTION public.release_multiplix_recipient_claim(uuid, uuid) IS NULL;
-- rollback: COMMENT ON FUNCTION public.reschedule_multiplix_recipient(uuid, uuid, timestamp with time zone, text) IS NULL;
-- rollback: COMMENT ON FUNCTION public.record_multiplix_recipient_delivered(text, uuid) IS NULL;
-- rollback: COMMENT ON FUNCTION public.sweep_multiplix_stuck_recipients(integer) IS NULL;
-- rollback: COMMENT ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) IS NULL;
--
-- F32 (parte 2 de 2) · Multiplix — as 10 RPCs da fila por ITEM (recipient x bloco).
--
-- Espelha, uma a uma, as 10 RPCs de `multiplix_recipients` sobre
-- `multiplix_delivery_items`, com a MESMA assinatura de entrada (so troca o alvo) e
-- os MESMOS REVOKE/GRANT (ACL so postgres+service_role). Todas SECURITY DEFINER com
-- `search_path = public, pg_temp`, como as originais.
--
-- A base NAO e o repo: cada corpo abaixo e a copia de `pg_get_functiondef` da versao
-- VIGENTE no banco (a de `20260929600000_multiplix_send_engine_fixes.sql` vence a de
-- `20260926180000`), medido nesta serie. As duas originais que NAO tem `recipient` no
-- nome ganharam nome proprio (`sweep_*_stuck_items`, `complete_*_if_items_drained`)
-- em vez de um `..._recipients_multiplix_item` ilegivel; as 8 restantes seguem o
-- padrao `*_multiplix_item*`.
--
-- §0 · Colunas que os espelhos EXIGEM (`personalized_message` e
--   `provider_dispatch_started_at`): nascem na CREATE TABLE do f32a (parte 1).
-- O desenho de F32a (a tabela) nao previu 2 colunas que as RPCs de origem usam e cuja
-- ausencia muda a semantica (nao e cosmetico):
--   * `provider_dispatch_started_at`: e o marco "o POST ja saiu para o provedor". Sem
--     ele NAO da para separar item preso ANTES do POST (reclaim seguro, volta para
--     pending) de item preso DEPOIS do POST (vira outcome_unknown, nunca reenvia) —
--     o requisito de nao duplicar mensagem de F11/F57 depende exatamente disso.
--   * `personalized_message`: com blocos, cada ITEM carrega a sua propria mensagem
--     renderizada (um destinatario tem N itens com textos diferentes); guardar so no
--     recipient apagaria a mensagem dos blocos 2..N.
-- Aditivas e idempotentes, para poderem ser dobradas no arquivo de F32a sem conflito.
--
-- §1 · Contadores do dispatch (decisao, explicita).
-- As originais fazem `+1` no contador a cada destinatario. No nivel do item um `+1`
-- por item conta MENSAGENS (aptos x blocos), nao destinatarios — e `sent_count`
-- passaria a poder exceder `total_recipients`. O espelho entao RECALCULA o contador
-- a partir dos itens (`count(*) FILTER`), em vez de incrementar:
--   sent_count          = itens em (sent, delivered, read)
--   delivered_count     = itens em (delivered, read)
--   failed_count        = itens em failed
--   outcome_unknown_count = itens em outcome_unknown
-- Isso preserva a relacao da origem (delivered e subconjunto de sent), torna a
-- operacao IDEMPOTENTE (reentrega/retry de webhook nao infla o contador, que e o
-- modo de falha real de um consumidor at-least-once) e usa o indice
-- `idx_multiplix_delivery_items_dispatch_status`. Consequencia assumida: o contador
-- passa a significar "mensagens". A UI do Bloco E/F (F50 "mensagens = aptos x blocos",
-- F52 "por bloco") ja conta assim; `total_recipients` continua contando destinatarios.
-- Os espelhos e as RPCs antigas NAO podem rodar no mesmo dispatch ao mesmo tempo
-- (contariam eixos diferentes); a migracao e corte, nao convivencia.
--
-- §2 · `attempt_count` (decisao, explicita).
-- A origem tem DOIS contadores: `delivery_attempt_count` (incrementado no claim) e
-- `attempt_count` (incrementado no reschedule, dead-letter em >=3). A tabela de itens
-- tem UM (`attempt_count`). Ficou sendo o de tentativa de envio: o claim incrementa
-- (e devolve como `delivery_attempt_count`, mantendo o contrato do worker) e o
-- reschedule NAO incrementa — apenas le o valor que o claim ja subiu e faz dead-letter
-- em `attempt_count >= 3`. Resultado observavel identico ao da origem (3a falha =
-- dead-letter) sem contar a mesma tentativa duas vezes.
--
-- §3 · Drenagem: `complete_multiplix_dispatch_if_items_drained` considera item nao
-- drenado em ('pending','sending','failed_transient'). `failed_transient` entra porque
-- e o estado de retry da fila por item (equivale ao `pending` + `retry_after` da
-- origem); sem ele o dispatch fecharia com item ainda na fila.
--
-- Depende de: F32a (tabela/indices), F30 (enum multiplix_item_status). Nenhuma das 10
-- originais e alterada no corpo — so recebem COMMENT de deprecacao.

-- ─────────────────────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · claim — equivalente de claim_multiplix_recipient
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.claim_multiplix_item(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_multiplix_item(uuid, uuid, text, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · mark dispatch started — equivalente de mark_multiplix_recipient_dispatch_started
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.mark_multiplix_item_dispatch_started(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_multiplix_item_dispatch_started(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · snapshot da mensagem do item — equivalente de persist_multiplix_recipient_message_snapshot
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.persist_multiplix_item_message_snapshot(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_multiplix_item_message_snapshot(uuid, uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · sent — equivalente de record_multiplix_recipient_sent
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.record_multiplix_item_sent(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_multiplix_item_sent(uuid, uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · complete — equivalente de complete_multiplix_recipient
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §6 · release — equivalente de release_multiplix_recipient_claim
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.release_multiplix_item_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_multiplix_item_claim(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §7 · reschedule — equivalente de reschedule_multiplix_recipient
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.reschedule_multiplix_item(uuid, uuid, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_multiplix_item(uuid, uuid, timestamp with time zone, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §8 · sweep — equivalente de sweep_multiplix_stuck_recipients
-- (nome proprio: a original tem "recipients" no meio, nao casa `*_multiplix_recipient*`)
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.sweep_multiplix_stuck_items(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_multiplix_stuck_items(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §9 · delivered — equivalente de record_multiplix_recipient_delivered
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.record_multiplix_item_delivered(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_multiplix_item_delivered(text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §10 · drenagem — equivalente de complete_multiplix_dispatch_if_drained
-- (nome proprio: a original nao tem "recipient" no nome)
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$;

REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §11 · Deprecacao das 10 originais (nome + assinatura identidade exata).
-- O corpo delas NAO muda: os workers ainda nao migrados continuam rodando.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.claim_multiplix_recipient(uuid, uuid, text, integer) IS
  'DEPRECATED (F32): usar claim_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.mark_multiplix_recipient_dispatch_started(uuid, uuid) IS
  'DEPRECATED (F32): usar mark_multiplix_item_dispatch_started - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.persist_multiplix_recipient_message_snapshot(uuid, uuid, text) IS
  'DEPRECATED (F32): usar persist_multiplix_item_message_snapshot - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.record_multiplix_recipient_sent(uuid, uuid, text) IS
  'DEPRECATED (F32): usar record_multiplix_item_sent - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.complete_multiplix_recipient(uuid, uuid, text, text) IS
  'DEPRECATED (F32): usar complete_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.release_multiplix_recipient_claim(uuid, uuid) IS
  'DEPRECATED (F32): usar release_multiplix_item_claim - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.reschedule_multiplix_recipient(uuid, uuid, timestamp with time zone, text) IS
  'DEPRECATED (F32): usar reschedule_multiplix_item - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.record_multiplix_recipient_delivered(text, uuid) IS
  'DEPRECATED (F32): usar record_multiplix_item_delivered - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.sweep_multiplix_stuck_recipients(integer) IS
  'DEPRECATED (F32): usar sweep_multiplix_stuck_items - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';

COMMENT ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) IS
  'DEPRECATED (F32): usar complete_multiplix_dispatch_if_items_drained - fila por item (recipient x bloco). Mantida para os workers ainda nao migrados.';
