-- envio_sem_conexao_de_teste_nem_fallback_silencioso
-- Auditoria Conversas 2026-11-13, P0-1.
--
-- Rollback (SQL executável, na ordem):
--   1. Recriar os três enqueue com o corpo ANTERIOR, copiando de cada arquivo o
--      bloco "CREATE OR REPLACE FUNCTION ... TO authenticated;" (sem alteração):
--        public.enqueue_outbound_message        -> 20261010211000_enqueue_outbound_message_media_url_scope.sql
--        public.enqueue_rich_outbound_message   -> 20261005130925_interactive_buttons_list_rich_outbound.sql
--        public.enqueue_group_outbound_message  -> 20261011155946_enqueue_group_outbound_message.sql (só a função de grupo)
--   2. drop function if exists public.resolve_outbound_whatsapp_connection(uuid, uuid);
--   3. (opcional, NÃO recomendado) a fixture volta a 'connected' com
--      update public.whatsapp_connections set status = 'connected' where instance_id = 'E2E_FIXTURE';
--
-- O QUE ESTAVA ERRADO
--   Em produção existe a linha de teste "[E2E] Conexão WhatsApp Teste"
--   (instance_id 'E2E_FIXTURE', semeada em 2026-09-28) com status 'connected' para
--   sempre: o connection-health-check pula essa linha. As três RPCs de enfileirar
--   envio tinham um fallback "qualquer conexão connected, a mais recente": quando a
--   conexão do contato caía, a mensagem era gravada na fixture. Resultado medido:
--   750 'failed' + 157 presas em 'sending' na fixture desde 28/09, e o aviso
--   "WhatsApp desconectado" nunca aparecia (a conexão resolvida era a fixture,
--   "saudável").
--
-- O QUE MUDA
--   1. Helper public.resolve_outbound_whatsapp_connection(explícita, atribuída):
--      a) conexão explícita: precisa estar 'connected', com instance_id e não ser a
--         fixture -> senão 'selected_whatsapp_connection_unavailable' (igual antes);
--      b) contato/grupo COM conexão atribuída que existe mas caiu (ou é a fixture):
--         'contact_whatsapp_connection_disconnected' (22023) -> a tela mostra
--         "WhatsApp desconectado". NÃO cai mais em outra conexão em silêncio;
--      c) sem conexão atribuída (contato legado): a conexão 'connected' mais recente,
--         EXCLUINDO instance_id 'E2E_FIXTURE' e nome iniciado por '[E2E]'.
--         Nenhuma -> 'no_connected_whatsapp_connection' (igual antes).
--   2. enqueue_outbound_message / enqueue_rich_outbound_message /
--      enqueue_group_outbound_message: corpo IDÊNTICO ao vigente, trocando só o
--      bloco de resolução de conexão pela chamada ao helper. Assinaturas, retorno,
--      ACL e demais validações sem mudança.
--   3. A fixture de produção deixa de ficar 'connected' (DML idempotente, 1 linha).
--      O E2E isolado (banco descartável) semeia a PRÓPRIA conexão com instance
--      'E2E_LOCAL' e a usa por conexão atribuída/explícita, então continua passando.
--
-- PRÉ-CONDIÇÕES (falha fechada): as três funções existem com as assinaturas abaixo.
-- PÓS-CONDIÇÕES: helper existe sem EXECUTE para anon/authenticated; nenhuma
-- conexão E2E_FIXTURE 'connected'.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('public.enqueue_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text)') IS NULL
     OR to_regprocedure('public.enqueue_rich_outbound_message(uuid, uuid, text, text, jsonb, uuid, uuid)') IS NULL
     OR to_regprocedure('public.enqueue_group_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: enqueue_* nao estao na versao esperada (aplique 20261010211000, 20261005130925 e 20261011155946 antes)';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.resolve_outbound_whatsapp_connection(
  p_explicit_connection_id uuid,
  p_assigned_connection_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_connection_id uuid;
BEGIN
  IF p_explicit_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_explicit_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
      AND connection.instance_id <> 'E2E_FIXTURE';
    IF v_connection_id IS NULL THEN
      RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
    END IF;
    RETURN v_connection_id;
  END IF;

  IF p_assigned_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_assigned_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
      AND connection.instance_id <> 'E2E_FIXTURE';
    IF v_connection_id IS NOT NULL THEN
      RETURN v_connection_id;
    END IF;
    -- A conexão do contato existe mas está fora do ar (ou é a fixture de teste):
    -- avisa em vez de mandar por outro número sem ninguém saber.
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_connections AS connection
      WHERE connection.id = p_assigned_connection_id
    ) THEN
      RAISE EXCEPTION 'contact_whatsapp_connection_disconnected' USING ERRCODE = '22023';
    END IF;
    -- Atribuição órfã (linha de conexão já não existe): trata como contato legado.
  END IF;

  SELECT connection.id INTO v_connection_id
  FROM public.whatsapp_connections AS connection
  WHERE connection.status = 'connected'
    AND NULLIF(connection.instance_id, '') IS NOT NULL
    AND connection.instance_id <> 'E2E_FIXTURE'
    AND COALESCE(connection.name, '') NOT LIKE '[E2E]%'
  ORDER BY connection.updated_at DESC, connection.id
  LIMIT 1;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'no_connected_whatsapp_connection' USING ERRCODE = '22023';
  END IF;
  RETURN v_connection_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_outbound_whatsapp_connection(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_outbound_whatsapp_connection(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.resolve_outbound_whatsapp_connection(uuid, uuid) IS
  'P0-1 (auditoria Conversas 2026-11-13): conexão de envio. Explícita viva; atribuída viva ou erro contact_whatsapp_connection_disconnected (sem fallback silencioso); contato sem conexão -> connected mais recente fora da fixture E2E. Nunca devolve instance_id E2E_FIXTURE.';

-- enqueue_outbound_message: corpo identico ao de 20261010211000_enqueue_outbound_message_media_url_scope.sql, trocando SO o bloco de resolucao de conexao.
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
  v_media_path text;
  v_media_owner text;
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

  -- SEC-DEFINER_GRANTS_STORAGE-01: a URL de midia e controlada pelo cliente. Se apontar para
  -- um bucket interno, o caminho do objeto tem de estar na pasta deste contato (ou de um
  -- contato do proprio chamador). Sem isso, a mensagem carregaria a URL do objeto de outra
  -- conversa e a policy de leitura do Storage liberaria a midia alheia.
  -- Fail-closed: qualquer URL que mencione um bucket interno tem de estar no formato canonico
  -- acima (object|render/image + public|sign|authenticated). Formas alternativas do Storage
  -- (ex.: /object/download/, /object/upload/, variante de sign fora do padrao) cairiam fora do
  -- IF abaixo e passariam sem escopo -- por isso sao recusadas aqui com 22023.
  IF p_media_url IS NOT NULL
     AND (p_media_url LIKE '%/whatsapp-media/%' OR p_media_url LIKE '%/audio-messages/%')
     AND p_media_url !~ '^https://[^/]+/storage/v1/(object|render/image)/(public|sign|authenticated)/(whatsapp-media|audio-messages)/' THEN
    RAISE EXCEPTION 'invalid_outbound_media_url' USING ERRCODE = '22023';
  END IF;
  IF p_media_url IS NOT NULL
     AND p_media_url ~ '^https://[^/]+/storage/v1/(object|render/image)/(public|sign|authenticated)/(whatsapp-media|audio-messages)/' THEN
    v_media_path := split_part(
      regexp_replace(
        p_media_url,
        '^https://[^/]+/storage/v1/(object|render/image)/(public|sign|authenticated)/(whatsapp-media|audio-messages)/',
        ''
      ),
      '?', 1
    );
    IF v_media_path = ''
       OR v_media_path LIKE '%..%'
       OR lower(v_media_path) LIKE '%2e%2e%'
       OR lower(v_media_path) LIKE '%2e/' THEN
      RAISE EXCEPTION 'invalid_outbound_media_url' USING ERRCODE = '22023';
    END IF;
    v_media_owner := split_part(v_media_path, '/', 1);
    IF v_media_owner <> p_contact_id::text
       AND NOT (
         v_media_owner ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         AND public.is_contact_visible_to_user(v_media_owner::uuid, auth.uid()) IS TRUE
       ) THEN
      RAISE EXCEPTION 'media_url_out_of_contact_scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT contact.whatsapp_connection_id INTO v_assigned_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  -- A conexao resolvida e gravada na mensagem enfileirada (lease deterministico).
  -- 20261113130000 (P0-1): resolucao unica da conexao de envio. Sem fallback
  -- silencioso quando a conexao do contato/grupo caiu, e a fixture de E2E
  -- (instance_id 'E2E_FIXTURE') nunca e escolhida. Ver o helper abaixo.
  v_connection_id := public.resolve_outbound_whatsapp_connection(
    p_whatsapp_connection_id, v_assigned_connection_id
  );

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

-- enqueue_rich_outbound_message: corpo identico ao de 20261005130925_interactive_buttons_list_rich_outbound.sql, trocando SO o bloco de resolucao de conexao.
CREATE OR REPLACE FUNCTION public.enqueue_rich_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_display_content text,
  p_message_type text,
  p_delivery_payload jsonb,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
  v_payload jsonb := p_delivery_payload;
  v_option_count integer;
  v_selectable_count integer;
  v_button_count integer;
  v_section_count integer;
  v_bad_section_count integer;
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
BEGIN
  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_display_content IS NULL OR length(p_display_content) > 65536
     OR p_message_type IS NULL OR p_message_type NOT IN ('poll', 'contact', 'buttons', 'list')
     OR v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
     OR pg_column_size(v_payload) > 16384 THEN
    RAISE EXCEPTION 'invalid_rich_outbound_message' USING ERRCODE = '22023';
  END IF;

  IF p_message_type = 'poll' THEN
    IF jsonb_typeof(v_payload->'name') <> 'string'
       OR length(v_payload->>'name') NOT BETWEEN 1 AND 1024
       OR jsonb_typeof(v_payload->'values') <> 'array' THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_option_count FROM jsonb_array_elements_text(v_payload->'values');
    IF v_option_count NOT BETWEEN 2 AND 12
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_payload->'values') AS option_value
         WHERE length(btrim(option_value)) NOT BETWEEN 1 AND 256
       ) THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_payload->'selectableCount') <> 'number'
       OR v_payload->>'selectableCount' !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_selectable_count := (v_payload->>'selectableCount')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END;
    IF v_selectable_count NOT BETWEEN 1 AND v_option_count THEN
      RAISE EXCEPTION 'invalid_poll_payload' USING ERRCODE = '22023';
    END IF;
  ELSIF p_message_type = 'contact' THEN
    IF jsonb_typeof(v_payload->'fullName') <> 'string'
       OR length(v_payload->>'fullName') NOT BETWEEN 1 AND 512
       OR jsonb_typeof(v_payload->'phoneNumber') <> 'string'
       OR regexp_replace(v_payload->>'phoneNumber', '\D', '', 'g') !~ '^[0-9]{8,15}$'
       OR (v_payload ? 'organization' AND (
         jsonb_typeof(v_payload->'organization') <> 'string'
         OR length(v_payload->>'organization') > 512
       ))
       OR (v_payload ? 'email' AND (
         jsonb_typeof(v_payload->'email') <> 'string'
         OR length(v_payload->>'email') > 320
       )) THEN
      RAISE EXCEPTION 'invalid_contact_card_payload' USING ERRCODE = '22023';
    END IF;
  ELSIF p_message_type = 'buttons' THEN
    -- IS DISTINCT FROM: chave obrigatória ausente (ou null) produziria NULL no
    -- `->` e passaria num `<> 'string'` — aqui ela é inválida de verdade.
    IF jsonb_typeof(v_payload->'body') IS DISTINCT FROM 'string'
       OR length(btrim(v_payload->>'body')) NOT BETWEEN 1 AND 1024
       OR (v_payload ? 'title' AND (
         jsonb_typeof(v_payload->'title') IS DISTINCT FROM 'string'
         OR length(v_payload->>'title') > 60
       ))
       OR (v_payload ? 'footer' AND (
         jsonb_typeof(v_payload->'footer') IS DISTINCT FROM 'string'
         OR length(v_payload->>'footer') > 60
       ))
       OR jsonb_typeof(v_payload->'buttons') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_buttons_payload' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_button_count FROM jsonb_array_elements(v_payload->'buttons');
    IF v_button_count NOT BETWEEN 1 AND 3
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_payload->'buttons') AS button
         WHERE jsonb_typeof(button) IS DISTINCT FROM 'object'
           OR jsonb_typeof(button->'type') IS DISTINCT FROM 'string'
           OR button->>'type' NOT IN ('reply', 'url', 'call')
           OR jsonb_typeof(button->'displayText') IS DISTINCT FROM 'string'
           OR length(btrim(button->>'displayText')) NOT BETWEEN 1 AND 20
           OR (button ? 'id' AND (
             jsonb_typeof(button->'id') IS DISTINCT FROM 'string'
             OR length(button->>'id') > 256
           ))
           OR (button->>'type' = 'reply' AND (
             jsonb_typeof(button->'id') IS DISTINCT FROM 'string'
             OR length(button->>'id') NOT BETWEEN 1 AND 256
           ))
           OR (button->>'type' = 'url' AND (
             jsonb_typeof(button->'url') IS DISTINCT FROM 'string'
             OR length(button->>'url') > 2048
             OR button->>'url' !~ '^https?://'
           ))
           OR (button->>'type' = 'call' AND (
             jsonb_typeof(button->'phoneNumber') IS DISTINCT FROM 'string'
             OR regexp_replace(button->>'phoneNumber', '\D', '', 'g') !~ '^[0-9]{8,15}$'
           ))
       ) THEN
      RAISE EXCEPTION 'invalid_buttons_payload' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- p_message_type = 'list'
    IF jsonb_typeof(v_payload->'body') IS DISTINCT FROM 'string'
       OR length(btrim(v_payload->>'body')) NOT BETWEEN 1 AND 1024
       OR (v_payload ? 'title' AND (
         jsonb_typeof(v_payload->'title') IS DISTINCT FROM 'string'
         OR length(v_payload->>'title') > 60
       ))
       OR (v_payload ? 'footer' AND (
         jsonb_typeof(v_payload->'footer') IS DISTINCT FROM 'string'
         OR length(v_payload->>'footer') > 60
       ))
       OR jsonb_typeof(v_payload->'buttonText') IS DISTINCT FROM 'string'
       OR length(btrim(v_payload->>'buttonText')) NOT BETWEEN 1 AND 20
       OR jsonb_typeof(v_payload->'sections') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_list_payload' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_section_count FROM jsonb_array_elements(v_payload->'sections');
    -- CASE avalia os WHEN em ordem: jsonb_array_elements só roda depois de
    -- confirmar que rows é array (evita "cannot extract elements" mascarando
    -- o erro canônico).
    SELECT count(*) INTO v_bad_section_count
    FROM jsonb_array_elements(v_payload->'sections') AS section
    WHERE CASE
      WHEN jsonb_typeof(section) IS DISTINCT FROM 'object' THEN true
      WHEN jsonb_typeof(section->'title') IS DISTINCT FROM 'string'
        OR length(btrim(section->>'title')) NOT BETWEEN 1 AND 24 THEN true
      WHEN jsonb_typeof(section->'rows') IS DISTINCT FROM 'array' THEN true
      WHEN (SELECT count(*) FROM jsonb_array_elements(section->'rows')) NOT BETWEEN 1 AND 10 THEN true
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(section->'rows') AS list_row
        WHERE jsonb_typeof(list_row) IS DISTINCT FROM 'object'
          OR jsonb_typeof(list_row->'title') IS DISTINCT FROM 'string'
          OR length(btrim(list_row->>'title')) NOT BETWEEN 1 AND 24
          OR (list_row ? 'description' AND (
            jsonb_typeof(list_row->'description') IS DISTINCT FROM 'string'
            OR length(list_row->>'description') > 72
          ))
          OR jsonb_typeof(list_row->'id') IS DISTINCT FROM 'string'
          OR length(list_row->>'id') NOT BETWEEN 1 AND 256
      ) THEN true
      ELSE false
    END;
    IF v_section_count NOT BETWEEN 1 AND 10 OR v_bad_section_count > 0 THEN
      RAISE EXCEPTION 'invalid_list_payload' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Authorize before probing an existing idempotency key. The replay path is
  -- otherwise an oracle for a guessed contact/client UUID pair.
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  SELECT contact.whatsapp_connection_id INTO v_assigned_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  -- 20261113130000 (P0-1): resolucao unica da conexao de envio. Sem fallback
  -- silencioso quando a conexao do contato/grupo caiu, e a fixture de E2E
  -- (instance_id 'E2E_FIXTURE') nunca e escolhida. Ver o helper abaixo.
  v_connection_id := public.resolve_outbound_whatsapp_connection(
    p_whatsapp_connection_id, v_assigned_connection_id
  );
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
  -- Serialize check-and-enqueue for the idempotency key. Without this lock a
  -- concurrent base enqueue could observe its temporary text row mid-upgrade.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text || ':' || p_client_message_id::text, 0));

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.contact_id = p_contact_id
    AND message.client_message_id = p_client_message_id;
  IF FOUND THEN
    IF v_message.sender = 'agent'
       AND v_message.agent_id = v_profile_id
       AND v_message.content = p_display_content
       AND v_message.message_type = p_message_type
       AND v_message.whatsapp_connection_id IS NOT DISTINCT FROM v_connection_id
       AND v_message.reply_to_id IS NOT DISTINCT FROM p_reply_to_id
       AND v_message.media_meta->'outbound_delivery_payload' = v_payload THEN
      RETURN v_message;
    END IF;
    RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
      USING ERRCODE = '23505';
  END IF;

  -- Reuse the canonical authorization, profile, connection and reply checks.
  PERFORM public.enqueue_outbound_message(
    p_contact_id,
    p_client_message_id,
    p_display_content,
    'text',
    NULL,
    p_reply_to_id,
    p_whatsapp_connection_id,
    NULL
  );

  UPDATE public.messages
  SET message_type = p_message_type,
      media_meta = jsonb_build_object('outbound_delivery_payload', v_payload),
      updated_at = statement_timestamp()
  WHERE contact_id = p_contact_id
    AND client_message_id = p_client_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_rich_outbound_message(
  uuid, uuid, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_rich_outbound_message(
  uuid, uuid, text, text, jsonb, uuid, uuid
) TO authenticated;

-- enqueue_group_outbound_message: corpo identico ao de 20261011155946_enqueue_group_outbound_message.sql, trocando SO o bloco de resolucao de conexao.
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

  -- Mesma resolucao de conexao da versao de contato (conexao atribuida ao grupo).
  -- 20261113130000 (P0-1): resolucao unica da conexao de envio. Sem fallback
  -- silencioso quando a conexao do contato/grupo caiu, e a fixture de E2E
  -- (instance_id 'E2E_FIXTURE') nunca e escolhida. Ver o helper abaixo.
  v_connection_id := public.resolve_outbound_whatsapp_connection(
    p_whatsapp_connection_id, v_assigned_connection_id
  );

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


-- Fixture de produção: nunca mais 'connected' (nenhum caminho de envio a usa).
UPDATE public.whatsapp_connections
   SET status = 'disconnected'
 WHERE instance_id = 'E2E_FIXTURE'
   AND status = 'connected';

DO $post$
BEGIN
  IF to_regprocedure('public.resolve_outbound_whatsapp_connection(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'pos-condicao: helper ausente';
  END IF;
  IF has_function_privilege('authenticated', 'public.resolve_outbound_whatsapp_connection(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolve_outbound_whatsapp_connection(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: helper nao pode ser executavel por anon/authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_connections WHERE instance_id = 'E2E_FIXTURE' AND status = 'connected') THEN
    RAISE EXCEPTION 'pos-condicao: fixture E2E ainda connected';
  END IF;
  IF position('resolve_outbound_whatsapp_connection' IN pg_get_functiondef('public.enqueue_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text)'::regprocedure)) = 0
     OR position('resolve_outbound_whatsapp_connection' IN pg_get_functiondef('public.enqueue_rich_outbound_message(uuid, uuid, text, text, jsonb, uuid, uuid)'::regprocedure)) = 0
     OR position('resolve_outbound_whatsapp_connection' IN pg_get_functiondef('public.enqueue_group_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: algum enqueue_* nao usa o helper';
  END IF;
END
$post$;

COMMIT;
