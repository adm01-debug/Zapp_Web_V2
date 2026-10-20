-- outbound_post_started
-- Rollback: restaura claim_outbound_message e guard_message_delivery_internal_fields com os corpos anteriores (abaixo), dropa mark_outbound_post_started(uuid, uuid) e remove a coluna delivery_post_started_at (perde os carimbos de POST, sem outro efeito).
-- Rollback (SQL executável, na ordem):
--   create or replace function public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer default 90) returns table(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamptz, delivery_attempt_count integer) language plpgsql security definer set search_path = public, pg_temp as $function$ BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF; IF p_message_id IS NULL OR p_agent_id IS NULL OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$' OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023'; END IF; RETURN QUERY WITH candidate AS (SELECT message.id, connection.id AS resolved_connection_id FROM public.messages AS message JOIN public.contacts AS contact ON contact.id = message.contact_id JOIN public.whatsapp_connections AS connection ON connection.id = COALESCE(message.whatsapp_connection_id, contact.whatsapp_connection_id) AND connection.status = 'connected' AND NULLIF(connection.instance_id, '') IS NOT NULL WHERE message.id = p_message_id AND message.agent_id = p_agent_id AND message.sender = 'agent' AND message.status = 'sending' AND message.external_id IS NULL AND message.client_message_id IS NOT NULL AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$' AND (message.delivery_claim_token IS NULL OR message.delivery_claim_expires_at <= statement_timestamp()) FOR UPDATE OF message SKIP LOCKED), claimed AS (UPDATE public.messages AS message SET delivery_claim_token = gen_random_uuid(), delivery_claimed_at = statement_timestamp(), delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds), delivery_claimed_by = p_worker, delivery_attempt_count = message.delivery_attempt_count + 1, whatsapp_connection_id = candidate.resolved_connection_id, updated_at = statement_timestamp() FROM candidate WHERE message.id = candidate.id RETURNING message.*) SELECT claimed.id, claimed.client_message_id, claimed.contact_id, claimed.agent_id, claimed.content, claimed.message_type, claimed.media_url, claimed.caption, claimed.media_filename, claimed.media_mimetype, claimed.reply_to_id, reply.external_id, claimed.whatsapp_connection_id, connection.instance_id, regexp_replace(contact.phone, '\D', '', 'g'), claimed.delivery_claim_token, claimed.delivery_claim_expires_at, claimed.delivery_attempt_count FROM claimed JOIN public.contacts AS contact ON contact.id = claimed.contact_id JOIN public.whatsapp_connections AS connection ON connection.id = claimed.whatsapp_connection_id LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id; END; $function$;
--   create or replace function public.guard_message_delivery_internal_fields() returns trigger language plpgsql set search_path = public, pg_temp as $function$ BEGIN IF current_user IN ('postgres', 'service_role') THEN RETURN NEW; END IF; IF (TG_OP = 'INSERT' AND (NEW.client_message_id IS NOT NULL OR NEW.delivery_claim_token IS NOT NULL OR NEW.delivery_claimed_at IS NOT NULL OR NEW.delivery_claim_expires_at IS NOT NULL OR NEW.delivery_claimed_by IS NOT NULL OR NEW.delivery_last_claim_token IS NOT NULL OR NEW.delivery_attempt_count <> 0)) OR (TG_OP = 'UPDATE' AND (NEW.client_message_id IS DISTINCT FROM OLD.client_message_id OR NEW.delivery_claim_token IS DISTINCT FROM OLD.delivery_claim_token OR NEW.delivery_claimed_at IS DISTINCT FROM OLD.delivery_claimed_at OR NEW.delivery_claim_expires_at IS DISTINCT FROM OLD.delivery_claim_expires_at OR NEW.delivery_claimed_by IS DISTINCT FROM OLD.delivery_claimed_by OR NEW.delivery_last_claim_token IS DISTINCT FROM OLD.delivery_last_claim_token OR NEW.delivery_attempt_count IS DISTINCT FROM OLD.delivery_attempt_count)) THEN RAISE EXCEPTION 'message_delivery_internal_fields_forbidden' USING ERRCODE = '42501'; END IF; IF TG_OP = 'UPDATE' AND OLD.client_message_id IS NOT NULL AND OLD.status = 'sending' AND OLD.external_id IS NULL AND (NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.sender IS DISTINCT FROM OLD.sender OR NEW.content IS DISTINCT FROM OLD.content OR NEW.message_type IS DISTINCT FROM OLD.message_type OR NEW.media_url IS DISTINCT FROM OLD.media_url OR NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_filename IS DISTINCT FROM OLD.media_filename OR NEW.media_mimetype IS DISTINCT FROM OLD.media_mimetype OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.media_size IS DISTINCT FROM OLD.media_size OR NEW.media_meta IS DISTINCT FROM OLD.media_meta OR NEW.ptt IS DISTINCT FROM OLD.ptt OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id OR NEW.status IS DISTINCT FROM OLD.status OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at OR NEW.external_id IS DISTINCT FROM OLD.external_id) THEN RAISE EXCEPTION 'message_delivery_payload_immutable' USING ERRCODE = '42501'; END IF; RETURN NEW; END; $function$;
--   drop function if exists public.mark_outbound_post_started(uuid, uuid);
--   alter table public.messages drop column if exists delivery_post_started_at;
--
-- PD-79 (t_8c6419cf): se o provedor demora mais que o lease de 90 s, ou a Edge
-- morre depois do POST, o lease vence e um novo clique reenviava ao WhatsApp — o
-- provedor recebia a MESMA mensagem duas vezes. A correção é em três partes:
--
-- 1. Coluna durável public.messages.delivery_post_started_at: carimbo do
-- instante em que a Edge marcou que o POST ao provedor ia sair.
-- 2. RPC mark_outbound_post_started(message_id, claim_token) (service role):
-- a Edge a chama IMEDIATAMENTE antes do POST. Fencing por (id, token) em
-- 'sending' sem recibo; idempotente no mesmo token; recusa lease vencido.
-- 3. claim_outbound_message passa a RECUSAR linha com POST iniciado E lease
-- vencido (resultado ambíguo: vai para 'verificar', nunca reenvia sozinho).
-- Sem marca, nada muda: lease vencido continua retomável.
--
-- A marca é protegida pelo mesmo guard_message_delivery_internal_fields (o
-- authenticated não pode forjar nem limpar o carimbo por UPDATE/INSERT direto).
-- Nada mais muda: DDL aditiva, sem DROP, sem DML.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Carimbo durável do POST ao provedor
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_post_started_at timestamptz;

COMMENT ON COLUMN public.messages.delivery_post_started_at IS
  'PD-79: instante em que a Edge marcou o POST ao provedor (mark_outbound_post_started). Com lease vencido, torna o resultado ambiguo e o claim recusa reivindicar de novo (sem reenvio cego). NULL quando o POST nunca comecou.';

-- ============================================================================
-- 2. Estende o guard: o authenticated nao forja nem limpa o carimbo.
-- (CREATE OR REPLACE idempotente; base identica a 20260909260000 + o campo novo.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_message_delivery_internal_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND (
        NEW.client_message_id IS NOT NULL
        OR NEW.delivery_claim_token IS NOT NULL
        OR NEW.delivery_claimed_at IS NOT NULL
        OR NEW.delivery_claim_expires_at IS NOT NULL
        OR NEW.delivery_claimed_by IS NOT NULL
        OR NEW.delivery_last_claim_token IS NOT NULL
        OR NEW.delivery_attempt_count <> 0
        OR NEW.delivery_post_started_at IS NOT NULL
      ))
     OR (TG_OP = 'UPDATE' AND (
        NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
        OR NEW.delivery_claim_token IS DISTINCT FROM OLD.delivery_claim_token
        OR NEW.delivery_claimed_at IS DISTINCT FROM OLD.delivery_claimed_at
        OR NEW.delivery_claim_expires_at IS DISTINCT FROM OLD.delivery_claim_expires_at
        OR NEW.delivery_claimed_by IS DISTINCT FROM OLD.delivery_claimed_by
        OR NEW.delivery_last_claim_token IS DISTINCT FROM OLD.delivery_last_claim_token
        OR NEW.delivery_attempt_count IS DISTINCT FROM OLD.delivery_attempt_count
        OR NEW.delivery_post_started_at IS DISTINCT FROM OLD.delivery_post_started_at
      )) THEN
    RAISE EXCEPTION 'message_delivery_internal_fields_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.client_message_id IS NOT NULL
     AND OLD.status = 'sending'
     AND OLD.external_id IS NULL
     AND (
       NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.caption IS DISTINCT FROM OLD.caption
       OR NEW.media_filename IS DISTINCT FROM OLD.media_filename
       OR NEW.media_mimetype IS DISTINCT FROM OLD.media_mimetype
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.media_size IS DISTINCT FROM OLD.media_size
       OR NEW.media_meta IS DISTINCT FROM OLD.media_meta
       OR NEW.ptt IS DISTINCT FROM OLD.ptt
       OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
       OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
     ) THEN
    RAISE EXCEPTION 'message_delivery_payload_immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. RPC de marca: fencing por (id, token) em 'sending' — idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_outbound_post_started(
  p_message_id uuid,
  p_claim_token uuid
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_delivery_post_mark' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fencing: só o dono do lease corrente, em 'sending' e sem recibo.
  IF v_message.delivery_claim_token IS DISTINCT FROM p_claim_token
     OR v_message.sender IS DISTINCT FROM 'agent'
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotente: repetir com o MESMO token devolve o carimbo já gravado.
  IF v_message.delivery_post_started_at IS NOT NULL THEN
    RETURN v_message;
  END IF;

  -- O POST só pode começar sob lease vivo: vencido, a marca é recusada para a
  -- Edge NÃO disparar; o re-claim (sem marca) decide o caminho.
  IF v_message.delivery_claim_expires_at IS NULL
     OR v_message.delivery_claim_expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'delivery_claim_expired' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET delivery_post_started_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;

COMMENT ON FUNCTION public.mark_outbound_post_started(uuid, uuid) IS
  'PD-79: marca que o POST ao provedor vai sair (fencing por id+token em status=sending). Idempotente no mesmo token; recusa lease vencido. Só service_role.';

REVOKE ALL ON FUNCTION public.mark_outbound_post_started(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_outbound_post_started(uuid, uuid)
  TO service_role;

-- ============================================================================
-- 4. claim_outbound_message RECUSA linha com POST iniciado E lease vencido
-- (resultado ambíguo). Base idêntica a 20260909270000 + a cláusula nova.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_outbound_message(
  p_message_id uuid,
  p_agent_id uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  message_id uuid,
  client_message_id uuid,
  contact_id uuid,
  agent_id uuid,
  content text,
  message_type text,
  media_url text,
  caption text,
  media_filename text,
  media_mimetype text,
  reply_to_id uuid,
  reply_external_id text,
  whatsapp_connection_id uuid,
  whatsapp_instance_name text,
  contact_phone text,
  claim_token uuid,
  claim_expires_at timestamptz,
  delivery_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_agent_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT message.id, connection.id AS resolved_connection_id
    FROM public.messages AS message
    JOIN public.contacts AS contact ON contact.id = message.contact_id
    JOIN public.whatsapp_connections AS connection
      ON connection.id = COALESCE(
        message.whatsapp_connection_id, contact.whatsapp_connection_id
      )
     AND connection.status = 'connected'
     AND NULLIF(connection.instance_id, '') IS NOT NULL
    WHERE message.id = p_message_id
      AND message.agent_id = p_agent_id
      AND message.sender = 'agent'
      AND message.status = 'sending'
      AND message.external_id IS NULL
      AND message.client_message_id IS NOT NULL
      AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$'
      AND (message.delivery_claim_token IS NULL
        OR message.delivery_claim_expires_at <= statement_timestamp())
      -- PD-79: POST já iniciado + lease vencido = resultado ambíguo.
      -- NÃO reivindica: sem reenvio cego (a linha vai para 'verificar').
      AND NOT (
        message.delivery_post_started_at IS NOT NULL
        AND message.delivery_claim_expires_at IS NOT NULL
        AND message.delivery_claim_expires_at <= statement_timestamp()
      )
    FOR UPDATE OF message SKIP LOCKED
  ), claimed AS (
    UPDATE public.messages AS message
    SET delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp()
          + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = message.delivery_attempt_count + 1,
        whatsapp_connection_id = candidate.resolved_connection_id,
        updated_at = statement_timestamp()
    FROM candidate
    WHERE message.id = candidate.id
    RETURNING message.*
  )
  SELECT claimed.id, claimed.client_message_id, claimed.contact_id,
         claimed.agent_id, claimed.content, claimed.message_type,
         claimed.media_url, claimed.caption, claimed.media_filename,
         claimed.media_mimetype, claimed.reply_to_id, reply.external_id,
         claimed.whatsapp_connection_id, connection.instance_id,
         regexp_replace(contact.phone, '\D', '', 'g'), claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed
  JOIN public.contacts AS contact ON contact.id = claimed.contact_id
  JOIN public.whatsapp_connections AS connection
    ON connection.id = claimed.whatsapp_connection_id
  LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  TO service_role;

COMMIT;
