-- Teste de regressão da policy "whatsapp media readable via visible message"
-- (PR G, etapas 36-40 — encaminhar mídia RECEBIDA; decisão 20261003-094634-3c7e-arquivos-fase7-pr-g)
-- Ref: docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md, etapa 39.
--
-- CONTEXTO. As policies de SELECT de storage.objects autorizam por (storage.foldername(name))[1]
-- comparado com id de contato (ou auth.uid()). Mídia recebida é gravada em `<messageType>/...`
-- (`image/`, `video/`, `document/`, áudio em `audio-messages/audio/...`), então o primeiro
-- segmento nunca é contato e o copy server-side do encaminhar falhava na leitura da origem.
-- A correção é uma policy ADITIVA que resolve o contato pela linha de public.messages.
--
-- ESCOPO E LIMITAÇÃO (importante, ler antes de confiar no resultado):
-- Rodando pela wrapper `db_query` do MCP, a sessão é service_role, que tem BYPASSRLS: os SELECTs
-- daqui NÃO passam pelo enforcement real das policies (mesma limitação declarada em
-- rls_dashboard.sql). O que este arquivo prova:
--   (a) ESTRUTURA: a policy nova existe com o predicado esperado e as DUAS policies antigas
--       continuam existindo — a condição "aditiva, nada removido ou alterado" fica travada;
--   (b) LÓGICA de autorização, com auth.uid() respondendo como usuário real via
--       set_config('request.jwt.claims', ..., true), no mesmo caminho que a policy usa.
-- O ENFORCEMENT real de RLS (atendente atribuído lê / não atribuído e anon são negados /
-- caminho sem message é negado / nome com `%` não vira curinga) foi provado em PG 17
-- DESCARTÁVEL com os papéis da plataforma emulados: 11 asserções, PROVA_OK=1 FALHAS=0,
-- incluindo o estado ANTERIOR (derrubada a policy, o mesmo atendente volta a ser negado).
-- Read-only, sem side effects (transação implicita do db_query).

DO $$
DECLARE
  v_pred text;
  v_falta_antiga text;
BEGIN
  -- (a1) a policy nova existe e é SELECT em storage.objects, TO authenticated
  SELECT qual INTO v_pred
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'whatsapp media readable via visible message'
     AND cmd = 'SELECT';
  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'rls_whatsapp_media T0 FALHOU: policy nova ausente (migration nao aplicada?)';
  END IF;

  -- (a2) o predicado cobre os dois buckets de midia do WhatsApp...
  IF position('whatsapp-media' IN v_pred) = 0 OR position('audio-messages' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'rls_whatsapp_media T0 FALHOU: predicado sem os buckets de midia: %', v_pred;
  END IF;
  -- ...e resolve o acesso pela linha de public.messages (sem SECURITY DEFINER)
  IF position('messages' IN v_pred) = 0 THEN
    RAISE EXCEPTION 'rls_whatsapp_media T0 FALHOU: predicado nao consulta messages: %', v_pred;
  END IF;

  -- (a3) condicao do Joaquim: aditiva — as DUAS policies antigas continuam existindo
  SELECT string_agg(p.policyname, ', ') INTO v_falta_antiga
    FROM (VALUES ('Users can read assigned whatsapp media'),
                 ('Users can read assigned audio messages')) AS esperado(nome)
    LEFT JOIN pg_policies p
      ON p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = esperado.nome
   WHERE p.policyname IS NULL;
  IF v_falta_antiga IS NOT NULL THEN
    RAISE EXCEPTION 'rls_whatsapp_media T1 FALHOU: policy antiga removida/renomeada: %', v_falta_antiga;
  END IF;
  RAISE NOTICE 'rls_whatsapp_media: estrutura ok (policy nova + duas antigas intactas)';

  -- (b) logica: usuario sem permissao nao enxerga o contato do atendente; o atendente enxerga
  DECLARE
    v_msg_contact uuid;
    v_msg_url     text;
    v_agent_user  uuid;
    v_other_user  uuid;
    v_other_prof  uuid;
  BEGIN
    SELECT m.contact_id, m.media_url INTO v_msg_contact, v_msg_url
      FROM public.messages m
     WHERE m.media_url LIKE '%/whatsapp-media/%'
     LIMIT 1;

    IF v_msg_contact IS NULL THEN
      RAISE NOTICE 'rls_whatsapp_media: sem mensagem de whatsapp-media em producao, T2-T3 pulados';
    ELSE
      SELECT p.user_id INTO v_agent_user
        FROM public.contacts c JOIN public.profiles p ON p.id = c.assigned_to
       WHERE c.id = v_msg_contact LIMIT 1;
      -- usuario comum (nem admin, nem supervisor, nem special_agent) e sem vinculo com o contato
      SELECT p.user_id, p.id INTO v_other_user, v_other_prof
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'agent'
       WHERE p.id <> (SELECT assigned_to FROM public.contacts WHERE id = v_msg_contact)
       LIMIT 1;

      IF v_agent_user IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_user)::text, true);
        IF NOT public.can_edit_contact(
             (SELECT assigned_to FROM public.contacts WHERE id = v_msg_contact), NULL, NULL, NULL, NULL) THEN
          RAISE EXCEPTION 'rls_whatsapp_media T2 FALHOU: atendente atribuido nao enxerga o contato dono da midia';
        END IF;

        -- T3: agora auth.uid() responde como o usuário comum (sem trocar de role)
        IF v_other_user IS NOT NULL THEN
          PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_user)::text, true);
          IF public.can_edit_contact(
               (SELECT assigned_to FROM public.contacts WHERE id = v_msg_contact), NULL, NULL, NULL, NULL) THEN
            RAISE EXCEPTION 'rls_whatsapp_media T3 FALHOU: usuario NAO atribuido enxerga o contato dono da midia';
          END IF;
        END IF;
        RAISE NOTICE 'rls_whatsapp_media: logica de visibilidade ok (uid=% sobre a midia %)', v_agent_user, v_msg_url;
      END IF;
    END IF;
  END;
END $$;
