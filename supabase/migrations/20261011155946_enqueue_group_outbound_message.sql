-- enqueue_group_outbound_message
-- Rollback: recria claim_outbound_message com o corpo anterior (abaixo), dropa a RPC nova e a coluna, que leva os indices/FK.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer default 90) returns table(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamptz, delivery_attempt_count integer) language plpgsql security definer set search_path = public, pg_temp as $$ begin if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if; if p_message_id is null or p_agent_id is null or p_worker is null or p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$' or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then raise exception 'invalid_delivery_claim' using errcode = '22023'; end if; return query with candidate as (select message.id, connection.id as resolved_connection_id from public.messages as message join public.contacts as contact on contact.id = message.contact_id join public.whatsapp_connections as connection on connection.id = coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) and connection.status = 'connected' and nullif(connection.instance_id, '') is not null where message.id = p_message_id and message.agent_id = p_agent_id and message.sender = 'agent' and message.status = 'sending' and message.external_id is null and message.client_message_id is not null and regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$' and (message.delivery_claim_token is null or message.delivery_claim_expires_at <= statement_timestamp()) for update of message skip locked), claimed as (update public.messages as message set delivery_claim_token = gen_random_uuid(), delivery_claimed_at = statement_timestamp(), delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds), delivery_claimed_by = p_worker, delivery_attempt_count = message.delivery_attempt_count + 1, whatsapp_connection_id = candidate.resolved_connection_id, updated_at = statement_timestamp() from candidate where message.id = candidate.id returning message.*) select claimed.id, claimed.client_message_id, claimed.contact_id, claimed.agent_id, claimed.content, claimed.message_type, claimed.media_url, claimed.caption, claimed.media_filename, claimed.media_mimetype, claimed.reply_to_id, reply.external_id, claimed.whatsapp_connection_id, connection.instance_id, regexp_replace(contact.phone, '\D', '', 'g'), claimed.delivery_claim_token, claimed.delivery_claim_expires_at, claimed.delivery_attempt_count from claimed join public.contacts as contact on contact.id = claimed.contact_id join public.whatsapp_connections as connection on connection.id = claimed.whatsapp_connection_id left join public.messages as reply on reply.id = claimed.reply_to_id; end; $$;
--   drop function if exists public.enqueue_group_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text);
--   drop index if exists public.messages_group_client_msg_uq;
--   drop index if exists public.messages_whatsapp_group_id_idx;
--   alter table public.messages drop constraint if exists messages_single_outbound_destination_chk;
--   alter table public.messages drop column if exists whatsapp_group_id;
--
-- Envio para grupo pela via canonica da fila (decisao do Joaquim 11/10/2026; paridade V3->V2 do
-- encaminhamento para grupo). PROBLEMA: public.enqueue_outbound_message exige um contacts.id e a
-- fila de delivery (public.claim_outbound_message) so resolve destino via JOIN contacts + telefone
-- em E.164; group nao tem contacts.id, entao nao havia caminho de envio para grupo com as garantias
-- da fila (idempotencia por client_message_id, visibilidade, permissao send_messages, claim/complete/
-- fail iguais).
-- DECISAO DE DESENHO: public.messages.contact_id JA e nullable, entao nenhuma ALTER no contrato
-- existente e necessaria -- basta uma COLUNA ADITIVA nullable public.messages.whatsapp_group_id
-- (FK -> public.whatsapp_groups.id). Linhas existentes ficam intactas (coluna NULL); o caminho de
-- contato segue identico. A idempotencia por client_message_id e preservada para grupo por um indice
-- unico parcial proprio (o ON CONFLICT (contact_id, client_message_id) nao serve: em Postgres NULLs
-- sao distintos, entao (NULL, cid) duplicaria sem a chave nova).
-- O destino no delivery continua sendo o campo escalar contact_phone do claim: para grupo ele passa a
-- ser o JID do grupo (public.whatsapp_groups.group_id, ex. 120363000000000000@g.us), que e o que o
-- provedor espera em `number`. Por isso claim_outbound_message e substituido SEM mudar assinatura nem
-- retorno: so ganha o ramo de grupo no destino e a resolucao da conexao.
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao; qualquer erro desfaz tudo.

-- 1) Coluna aditiva + FK (ON DELETE SET NULL: apagar o grupo nao apaga o historico da fila).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS whatsapp_group_id uuid
  REFERENCES public.whatsapp_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.whatsapp_group_id IS
  'Destino de grupo da fila de envio (whatsapp_groups.id). Mutuamente exclusivo com contact_id em mensagens novas; NULL nas mensagens de contato e no historico.';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conname = 'messages_single_outbound_destination_chk'
      AND constraint_row.conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_single_outbound_destination_chk
      CHECK (NOT (contact_id IS NOT NULL AND whatsapp_group_id IS NOT NULL))
      NOT VALID;
  END IF;
END;
$do$;
ALTER TABLE public.messages VALIDATE CONSTRAINT messages_single_outbound_destination_chk;

-- 2) Idempotencia para grupo (o unico parcial de contato nao cobre NULLxcid).
CREATE UNIQUE INDEX IF NOT EXISTS messages_group_client_msg_uq
  ON public.messages (whatsapp_group_id, client_message_id)
  WHERE client_message_id IS NOT NULL AND whatsapp_group_id IS NOT NULL;

-- 3) Indice de suporte a FK (ON DELETE SET NULL de whatsapp_groups).
CREATE INDEX IF NOT EXISTS messages_whatsapp_group_id_idx
  ON public.messages (whatsapp_group_id)
  WHERE whatsapp_group_id IS NOT NULL;

-- 4) RPC de enfileiramento para grupo: mesmos parametros/retorno da versao de contato, com
--    p_group_id (whatsapp_groups.id) no lugar de p_contact_id.
CREATE OR REPLACE FUNCTION public.enqueue_group_outbound_message(
  p_group_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL,
  p_caption text DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
  v_group_jid text;
  v_reply_group_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  -- L9 (docs/ia/IA-004-matriz-autorizacao.md): mesma guarda de permissao da versao de contato.
  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
     OR (v_message_type NOT IN ('text', 'location') AND p_media_url IS NULL)
     OR (v_message_type = 'location' AND p_media_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;

  -- Acesso ao grupo: a policy de SELECT de public.whatsapp_groups ja autoriza todo authenticated
  -- ("Authenticated users can view whatsapp groups", USING (true)); a fronteira real de escrita e a
  -- permissao send_messages acima + o escopo de conexao abaixo. Grupo inexistente e grupo sem
  -- acesso tem a MESMA resposta (sem oraculo de enumeracao).
  SELECT grp.whatsapp_connection_id, grp.group_id
    INTO v_assigned_connection_id, v_group_jid
  FROM public.whatsapp_groups AS grp
  WHERE grp.id = p_group_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_group_not_authorized' USING ERRCODE = '42501';
  END IF;
  -- Sem JID de grupo valido a mensagem ficaria presa na fila para sempre (Evolution recebe `number`
  -- invalido). Recusa cedo, como o telefone invalido e recusado no ramo de contato.
  IF v_group_jid IS NULL OR v_group_jid !~ '^[0-9][0-9-]*@g[.]us$' THEN
    RAISE EXCEPTION 'message_group_not_deliverable' USING ERRCODE = '22023';
  END IF;

  -- Mesma resolucao de conexao da versao de contato: conexao atribuida ao grupo, escolha explicita
  -- valida, e fallback para a conexao 'connected' mais recente.
  IF p_whatsapp_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_whatsapp_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
    IF v_connection_id IS NULL THEN
      RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
    END IF;
  ELSIF v_assigned_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = v_assigned_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
  END IF;
  IF v_connection_id IS NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
    ORDER BY connection.updated_at DESC, connection.id
    LIMIT 1;
  END IF;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'no_connected_whatsapp_connection' USING ERRCODE = '22023';
  END IF;

  -- Visibilidade do grupo: se a conexao do grupo (ou a conexao resolvida, quando o grupo
  -- ainda nao tem conexao atribuida) esta vinculada a fila, usuario comum precisa ser
  -- membro ativo de alguma dessas filas. A resposta fica igual a grupo inexistente para
  -- nao criar oraculo de enumeracao.
  IF public.is_admin_or_supervisor(auth.uid()) IS NOT TRUE
     AND EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       WHERE link.whatsapp_connection_id = COALESCE(v_assigned_connection_id, v_connection_id)
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       JOIN public.queue_members AS member ON member.queue_id = link.queue_id
       JOIN public.profiles AS caller_profile ON caller_profile.id = member.profile_id
       WHERE link.whatsapp_connection_id = COALESCE(v_assigned_connection_id, v_connection_id)
         AND caller_profile.user_id = auth.uid()
         AND caller_profile.is_active
         AND COALESCE(member.is_active, true)
     ) THEN
    RAISE EXCEPTION 'message_group_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- L7: mesma regra de escopo de conexao por fila da versao de contato para a conexao
  -- efetivamente usada no envio quando ela difere da conexao propria do grupo.
  IF public.is_admin_or_supervisor(auth.uid()) IS NOT TRUE
     AND v_connection_id IS DISTINCT FROM v_assigned_connection_id
     AND EXISTS (
       SELECT 1 FROM public.whatsapp_connection_queues AS link
       WHERE link.whatsapp_connection_id = v_connection_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       JOIN public.queue_members AS member ON member.queue_id = link.queue_id
       JOIN public.profiles AS caller_profile ON caller_profile.id = member.profile_id
       WHERE link.whatsapp_connection_id = v_connection_id
         AND caller_profile.user_id = auth.uid()
         AND caller_profile.is_active
         AND COALESCE(member.is_active, true)
     ) THEN
    RAISE EXCEPTION 'whatsapp_connection_out_of_scope' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1
  FOR SHARE;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.whatsapp_group_id INTO v_reply_group_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_group_id IS DISTINCT FROM p_group_id THEN
      RAISE EXCEPTION 'reply_message_group_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('group:' || p_group_id::text || ':' || p_client_message_id::text, 0)
  );

  INSERT INTO public.messages (
    contact_id, whatsapp_group_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, caption, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    NULL, p_group_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_caption, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (whatsapp_group_id, client_message_id)
    WHERE client_message_id IS NOT NULL AND whatsapp_group_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;

  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.whatsapp_group_id = p_group_id
      AND message.client_message_id = p_client_message_id;
    IF v_message.id IS NULL
       OR v_message.agent_id IS DISTINCT FROM v_profile_id
       OR v_message.sender IS DISTINCT FROM 'agent'
       OR v_message.content IS DISTINCT FROM p_content
       OR v_message.message_type IS DISTINCT FROM v_message_type
       OR v_message.media_url IS DISTINCT FROM p_media_url
       OR v_message.caption IS DISTINCT FROM p_caption
       OR v_message.reply_to_id IS DISTINCT FROM p_reply_to_id
       OR v_message.whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
      RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_group_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_group_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) TO authenticated;

COMMENT ON FUNCTION public.enqueue_group_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text) IS
  'authenticated-only idempotent enqueue of an outbound message to a whatsapp_groups.id; same queue guarantees as enqueue_outbound_message.';

-- 5) claim_outbound_message passa a resolver destino de grupo. Assinatura/retorno/ACL identicos:
--    muda so o destino (JID do grupo no lugar do telefone) e a resolucao da conexao do grupo.
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
$function$;

REVOKE ALL ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer) IS
  'service_role-only atomic lease; transport reuses a stable provider id. contact_phone carries the E.164 phone for contact messages or the group JID for group messages.';
