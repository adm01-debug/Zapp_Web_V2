-- TC-001 (#54) — fluxo de mídia do Team Chat: um só contrato de identidade e de locator.
-- Rollback: ver a linha "-- Rollback:" completa no fim do arquivo (DROP POLICY/CREATE POLICY das
-- duas policies na forma anterior e DROP/ADD dos dois CHECKs de team_messages na forma anterior).
-- O uploader canônico (`src/hooks/team-chat/uploadTeamMedia.ts`) grava
-- `<profile_id>/<conversation_id>/<uuid>.<ext>` no bucket privado team-chat-files e persiste o
-- locator (`media_bucket` + `media_path` + `media_type`) SEM `media_url` — o bucket é privado e a
-- leitura é por URL assinada. Contra esse contrato único, o banco tinha três incompatibilidades:
--   (a) a policy de INSERT já exigia `current_profile_id()` no 1º segmento, mas as de SELECT e
--       DELETE comparavam o 1º segmento com `auth.uid()`: o membro cujo `profiles.id` difere de
--       `auth.uid()` enviava o anexo e não conseguia ler nem excluir o próprio anexo;
--   (b) o ramo EXISTS da policy de SELECT escrevia `tm.media_path = name` sem qualificar a coluna
--       do objeto: dentro da subquery `name` resolvia para `public.profiles.name`, a correlação com
--       o objeto consultado desaparecia e QUALQUER objeto do bucket ficava legível para um membro
--       que tivesse uma mensagem com `media_path` igual ao próprio nome do perfil;
--   (c) os CHECKs de `team_messages` exigiam `media_url` (`team_messages_media_consistency`),
--       então a mensagem canônica (locator + media_type, sem URL) era recusada no INSERT.
-- O que esta migration NÃO muda: a policy de INSERT (segue só `current_profile_id()`), o REVOKE
-- do UPDATE, os ramos de admin e a exigência de mensagem não vazia (só ganha a alternativa
-- "tem locator"), e nenhum GRANT/papel/ACL.

-- (b) + (a) SELECT: uma identidade (profiles.id) e a coluna do objeto qualificada.
DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;
CREATE POLICY "Conversation members can read team chat files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (
      -- ramo canônico: a pasta é o profile_id de quem enviou (mesma regra do INSERT);
      -- o ramo legado por auth.uid() fica porque há objeto gravado no padrão antigo e
      -- ele só dá acesso à pasta do próprio usuário autenticado.
      (storage.foldername(name))[1] IN ((public.current_profile_id())::text, (auth.uid())::text)
      OR public.is_admin_or_supervisor(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.team_messages tm
        JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
        JOIN public.profiles p ON p.id = mem.profile_id
        WHERE tm.media_bucket = storage.objects.bucket_id
          AND tm.media_path = storage.objects.name
          AND p.user_id = auth.uid()
      )
    )
  );

-- (a) DELETE: mesma identidade do INSERT/SELECT (o dono exclui o anexo próprio).
DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;
CREATE POLICY "Users can delete own team chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (storage.foldername(name))[1] IN ((public.current_profile_id())::text, (auth.uid())::text)
  );

-- (c) CHECKs da mensagem: o locator privado passa a valer como referência de mídia.
-- Forma nova = forma antiga OU locator completo com media_type; bucket/path sem
-- media_type não contam como mídia e não podem entrar como locator incompleto.
ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_content_not_empty;
ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_content_not_empty
  CHECK (
    trim(content) <> ''
    OR media_url IS NOT NULL
    OR (media_type IS NOT NULL AND media_bucket IS NOT NULL AND media_path IS NOT NULL)
  );

ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_media_consistency;
ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_media_consistency
  CHECK (
    (
      media_bucket IS NULL
      AND media_path IS NULL
      AND ((media_url IS NULL) = (media_type IS NULL))
    )
    OR (
      media_type IS NOT NULL
      AND media_bucket IS NOT NULL
      AND media_path IS NOT NULL
    )
  );

-- Rollback: DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects; CREATE POLICY "Conversation members can read team chat files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'team-chat-files' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.is_admin_or_supervisor(auth.uid()) OR EXISTS (SELECT 1 FROM public.team_messages tm JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id JOIN public.profiles p ON p.id = mem.profile_id WHERE tm.media_bucket = 'team-chat-files' AND tm.media_path = name AND p.user_id = auth.uid())));
-- Rollback: DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects; CREATE POLICY "Users can delete own team chat files" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'team-chat-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
-- Rollback: ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_content_not_empty, DROP CONSTRAINT IF EXISTS team_messages_media_consistency;
-- Rollback: ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_content_not_empty CHECK (trim(content) <> '' OR media_url IS NOT NULL), ADD CONSTRAINT team_messages_media_consistency CHECK ((media_url IS NULL) = (media_type IS NULL));
