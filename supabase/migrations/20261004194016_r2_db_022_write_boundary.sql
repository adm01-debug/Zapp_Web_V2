-- R2-DB-022 (P1) — fronteira de escrita de public.messages e validação canônica de mídia no enqueue.
-- Rollback: DROP TRIGGER trg_guard_message_provenance_fields ON public.messages; DROP FUNCTION public.guard_message_provenance_fields(); DROP FUNCTION public.is_canonical_outbound_media_locator(text,uuid); e recrie enqueue_outbound_message a partir da migration 20260930200000_enforce_enqueue_connection_scope.sql.

-- OBJETIVO. Um authenticated não pode transformar uma mensagem autorizada em credencial de
-- Storage: alterar media_url (ou contact_id/sender/agent_id/external_id) de uma mensagem que
-- ele enxerga, ou forjar um INSERT, faz a policy de SELECT de storage.objects (que casa
-- objects.name com messages.media_url) conceder leitura de mídia de outro contato. Esta
-- migration fecha a fronteira de ESCRITA:
--   1. trigger BEFORE INSERT/UPDATE que bloqueia, para current_user fora de postgres/service_role,
--      qualquer alteração de proveniência (media_url/contact_id/sender/agent_id/external_id) e
--      qualquer INSERT que fabrique origem (sender != 'agent', external_id ou media_url preenchidos);
--   2. validação canônica do locator de mídia no enqueue_outbound_message: HTTPS, bucket privado
--      permitido (whatsapp-media ou audio-messages) e primeiro segmento do object path idêntico
--      ao p_contact_id — sem query, fragment ou percent-encoding que embarace o primeiro segmento.
-- Edições legítimas de conteúdo/metadados (content, is_read, is_deleted, caption, transcription,
-- link_preview, ...) continuam livres; service_role/ingestão permanecem funcionais.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1) Trigger de proveniência da escrita em messages.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_provenance_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender IS DISTINCT FROM 'agent' THEN
      RAISE EXCEPTION 'message_sender_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.external_id IS NOT NULL THEN
      RAISE EXCEPTION 'message_external_id_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.media_url IS NOT NULL THEN
      RAISE EXCEPTION 'message_media_url_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
      RAISE EXCEPTION 'message_provenance_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_provenance_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_message_provenance_fields ON public.messages;
CREATE TRIGGER trg_guard_message_provenance_fields
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_provenance_fields();

-- ---------------------------------------------------------------------------
-- 2) Predicado canônico do locator de mídia de agente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_canonical_outbound_media_locator(
  p_media_url text,
  p_contact_id uuid
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_url text := coalesce(p_media_url, '');
  v_contact_seg text;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN false;
  END IF;

  -- Locator canônico: HTTPS, rota /object/public/ do Storage, bucket privado
  -- permitido (whatsapp-media | audio-messages), primeiro segmento do object
  -- path em formato UUID e nome de arquivo em que o primeiro caractere é
  -- [A-Za-z0-9_-] e os demais [A-Za-z0-9._-] — rejeita '/', '%', '?', '#', '\',
  -- o segmento '.'/'..' e qualquer nome iniciado por '.'. Query, fragment e
  -- percent-encoding são rejeitados justamente porque podem embaralhar o
  -- primeiro segmento.
  IF v_url !~ '^https://[^/?#@]+/storage/v1/object/public/(whatsapp-media|audio-messages)/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]*$' THEN
    RETURN false;
  END IF;

  v_contact_seg := lower(split_part(split_part(v_url, '/object/public/', 2), '/', 2));
  RETURN v_contact_seg = lower(p_contact_id::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.is_canonical_outbound_media_locator(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) enqueue_outbound_message com a validação canônica de mídia.
--    (mesma assinatura e mesmos guardas da versão vigente; só o teste de
--    p_media_url deixa de ser regex ^https:// e passa a exigir o locator
--    canônico do contato de destino)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
  p_contact_id uuid,
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
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
  v_reply_contact_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND NOT public.is_canonical_outbound_media_locator(p_media_url, p_contact_id))
     OR (v_message_type NOT IN ('text', 'location') AND p_media_url IS NULL)
     OR (v_message_type = 'location' AND p_media_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;

  SELECT contact.whatsapp_connection_id INTO v_assigned_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;

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
  IF public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.contact_id INTO v_reply_contact_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_contact_id IS DISTINCT FROM p_contact_id THEN
      RAISE EXCEPTION 'reply_message_contact_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_contact_id::text || ':' || p_client_message_id::text, 0)
  );

  INSERT INTO public.messages (
    contact_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, caption, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    p_contact_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_caption, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (contact_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;

  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.contact_id = p_contact_id
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

REVOKE ALL ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) TO authenticated;

COMMIT;
