BEGIN

SET LOCAL lock_timeout = '5s'

SET LOCAL statement_timeout = '120s'

DO $precond$
BEGIN
  IF to_regclass('public.whatsapp_groups') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns AS col
       WHERE col.table_schema = 'public'
         AND col.table_name = 'messages'
         AND col.column_name = 'whatsapp_group_id'
     ) THEN
    RAISE EXCEPTION 'outbound_post_started_requires_20261011155946'
      USING ERRCODE = '55000',
            HINT = 'Aplique antes a migration 20261011155946_enqueue_group_outbound_message: o claim reescrito aqui le whatsapp_groups e messages.whatsapp_group_id.';
  END IF;
END
$precond$

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_post_started_at timestamptz

COMMENT ON COLUMN public.messages.delivery_post_started_at IS
  'PD-79: instante em que a Edge marcou o POST ao provedor (mark_outbound_post_started). Com lease vencido, torna o resultado ambiguo e o claim recusa reivindicar de novo (sem reenvio cego). NULL quando o POST nunca comecou.'

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
$function$

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

  -- O POST só pode começar sob lease vivo: vencido, a marca é recusada (mesmo
  -- que já exista carimbo) para a Edge NÃO disparar. Vem ANTES do retorno
  -- idempotente: repetir a marca com o mesmo token depois do vencimento não pode
  -- autorizar um POST fora do lease.
  IF v_message.delivery_claim_expires_at IS NULL
     OR v_message.delivery_claim_expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'delivery_claim_expired' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotente: repetir com o MESMO token, sob o MESMO lease, devolve o carimbo
  -- já gravado. Carimbo de um lease ANTERIOR (anterior ao claim corrente) é POST
  -- possivelmente já enviado: nunca vira sucesso para o lease novo.
  IF v_message.delivery_post_started_at IS NOT NULL THEN
    IF v_message.delivery_claimed_at IS NOT NULL
       AND v_message.delivery_post_started_at >= v_message.delivery_claimed_at THEN
      RETURN v_message;
    END IF;
    RAISE EXCEPTION 'outbound_post_already_started' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET delivery_post_started_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$

COMMENT ON FUNCTION public.mark_outbound_post_started(uuid, uuid) IS
  'PD-79: marca que o POST ao provedor vai sair (fencing por id+token em status=sending). Idempotente no mesmo token; recusa lease vencido. Só service_role.'

REVOKE ALL ON FUNCTION public.mark_outbound_post_started(uuid, uuid)
  FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.mark_outbound_post_started(uuid, uuid)
  TO service_role

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
    LEFT JOIN public.contacts AS contact ON contact.id = message.contact_id
    LEFT JOIN public.whatsapp_groups AS grp ON grp.id = message.whatsapp_group_id
    JOIN public.whatsapp_connections AS connection
      ON connection.id = COALESCE(
        message.whatsapp_connection_id, contact.whatsapp_connection_id,
        grp.whatsapp_connection_id
      )
     AND connection.status = 'connected'
     AND NULLIF(connection.instance_id, '') IS NOT NULL
    WHERE message.id = p_message_id
      AND message.agent_id = p_agent_id
      AND message.sender = 'agent'
      AND message.status = 'sending'
      AND message.external_id IS NULL
      AND message.client_message_id IS NOT NULL
      AND (
        (message.contact_id IS NOT NULL
          AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$')
        OR (message.whatsapp_group_id IS NOT NULL
          AND grp.group_id ~ '^[0-9][0-9-]*@g[.]us$')
      )
      AND (message.delivery_claim_token IS NULL
        OR message.delivery_claim_expires_at <= statement_timestamp())
      -- PD-79: POST já iniciado = resultado ambíguo (pode ter chegado ao
      -- provedor). NÃO reivindica, haja ou não lease/expiração: um
      -- fail_outbound_message(retryable) limpa token e expiração mas deixa o
      -- carimbo, e a linha voltaria a ser reivindicável (reenvio cego). Sem reenvio
      -- automático: a linha fica em 'sending' até resolução explícita
      -- (fail_outbound_message com o token do lease que carimbou, ou complete).
      AND message.delivery_post_started_at IS NULL
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
         CASE
           WHEN claimed.contact_id IS NOT NULL
             THEN regexp_replace(contact.phone, '\D', '', 'g')
           ELSE grp.group_id
         END,
         claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed
  LEFT JOIN public.contacts AS contact ON contact.id = claimed.contact_id
  LEFT JOIN public.whatsapp_groups AS grp ON grp.id = claimed.whatsapp_group_id
  JOIN public.whatsapp_connections AS connection
    ON connection.id = claimed.whatsapp_connection_id
  LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id;
END;
$function$

REVOKE ALL ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  TO service_role

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS manually_resolved_at timestamptz

COMMENT ON COLUMN public.messages.manually_resolved_at IS
  'C110: timestamp da resolução manual por admin/supervisor via resolve_unconfirmed_message. Quando preenchido, o reconciliador e o webhook de recibos ignoram atualizações de status desta mensagem.'

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
        OR NEW.manually_resolved_at IS NOT NULL
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
        OR NEW.manually_resolved_at IS DISTINCT FROM OLD.manually_resolved_at
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
$function$

CREATE OR REPLACE FUNCTION public.resolve_unconfirmed_message(
  p_message_id uuid,
  p_outcome    text  ) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result    uuid;
  v_new_status text;
BEGIN
  -- SECURITY DEFINER — RLS não se aplica; verificação de papel e permissão explícita abaixo
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'authenticated_required' USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('sent', 'not_delivered') THEN
    RAISE EXCEPTION 'invalid_resolve_outcome' USING ERRCODE = '22023';
  END IF;

  -- Somente admin ou supervisor podem corrigir
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin_or_supervisor_required' USING ERRCODE = '42501';
  END IF;

  v_new_status := CASE p_outcome WHEN 'sent' THEN 'sent' ELSE 'failed' END;

  UPDATE public.messages
  SET
    status               = v_new_status,
    status_updated_at    = statement_timestamp(),
    manually_resolved_at = statement_timestamp(),
    updated_at           = statement_timestamp()
  WHERE id                        = p_message_id
    AND delivery_post_started_at IS NOT NULL
    AND manually_resolved_at     IS NULL
    AND status NOT IN ('sent', 'delivered', 'read')
    AND (delivery_claim_expires_at IS NULL OR delivery_claim_expires_at <= statement_timestamp())
  RETURNING id INTO v_result;

  IF NOT FOUND THEN
    -- Mensagem inexistente, já resolvida ou não elegível
    RAISE EXCEPTION 'message_not_resolvable' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$function$

REVOKE ALL ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  TO authenticated

COMMIT
