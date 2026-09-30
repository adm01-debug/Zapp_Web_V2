-- L7 da matriz docs/ia/IA-004-matriz-autorizacao.md: impoe o escopo de fila na
-- escolha da conexao de envio dentro do enqueue_outbound_message.
--
-- Causa raiz: a RPC aceitava qualquer conexao 'connected' informada em
-- p_whatsapp_connection_id (e, sem parametro, caia no fallback "qualquer conexao
-- conectada mais recente") sem checar se o chamador tem aquela conexao no escopo
-- dele. Nem as policies de leitura de conexao nem a RPC distinguiam fila.
--
-- Mudanca inerte por construcao enquanto whatsapp_connection_queues estiver vazia
-- (conferido no banco canonico em 30/09/2026: 0 vinculos; 2 conexoes; 4 membros
-- numa fila), e efetiva assim que a fila passar a ter conexao vinculada.
--
-- Forward-only: repoe a MESMA funcao (ja com a guarda de permissao do L9) com o
-- escopo de conexao, sem alterar a ACL efetiva e sem tocar mensagens.

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

  -- L9 (docs/ia/IA-004-matriz-autorizacao.md): a permissao send_messages so era
  -- checada no cliente (hasPermission sobre um array). Esconder o botao nao impedia
  -- a acao: qualquer authenticated enfileirava mensagem por esta RPC. A checagem passa
  -- a ser imposta aqui, no banco. user_has_permission() e SECURITY DEFINER e casa
  -- user_roles.user_id com o auth.uid() do chamador (nao com profiles.id).
  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
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
  -- Preserve the established inbox behavior for legacy contacts that predate
  -- per-contact connection assignment. The resolved connection is persisted on
  -- the queued message, making the subsequent lease deterministic.
  -- An explicit operator choice takes precedence, but must be a live
  -- connection. Otherwise use the assigned connection only while it is live,
  -- then deliberately fall back for historical/disconnected assignments.
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

  -- L7 (docs/ia/IA-004-matriz-autorizacao.md): a escolha da conexao de envio nao
  -- distinguia fila/departamento -- um agente podia enviar pelo numero de qualquer
  -- conexao 'connected' (parametro explicito ou o fallback da linha de cima), sem
  -- relacao com as filas dele. A regra passa a ser imposta aqui:
  --   * admin/supervisor escolhem qualquer conexao;
  --   * a conexao atribuida ao proprio contato continua valendo (o front manda
  --     justamente a conexao do contato);
  --   * conexao SEM vinculo em whatsapp_connection_queues nao tem escopo para
  --     comparar -- permanece utilizavel (mesma filosofia de fallback historico
  --     das conexoes atribuidas acima), entao a mudanca e inerte enquanto a
  --     tabela de vinculos nao estiver configurada;
  --   * conexao COM vinculo so pode ser usada por quem e membro ativo de uma das
  --     filas dela.
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
