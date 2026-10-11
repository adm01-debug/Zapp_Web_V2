-- bucket_limits_e_team_chat_files_identidade
-- Rollback: volta as duas policies de team-chat-files para auth.uid() e zera os limites dos buckets stickers/audio-memes.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Users can delete own team chat files" on storage.objects; create policy "Users can delete own team chat files" on storage.objects for delete to authenticated using (bucket_id = 'team-chat-files' and (storage.foldername(name))[1] = (auth.uid())::text);
--   drop policy if exists "Conversation members can read team chat files" on storage.objects; create policy "Conversation members can read team chat files" on storage.objects for select using (bucket_id = 'team-chat-files' and ((storage.foldername(name))[1] = (auth.uid())::text or is_admin_or_supervisor(auth.uid()) or exists (select 1 from public.team_messages tm join public.team_conversation_members mem on mem.conversation_id = tm.conversation_id join public.profiles p on p.id = mem.profile_id where tm.media_bucket = 'team-chat-files' and tm.media_path = name and p.user_id = auth.uid())));
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('stickers', 'audio-memes');
--
-- SEC-DEFINER_GRANTS_STORAGE-06 (P3): stickers e audio-memes sao buckets PUBLICOS e nasceram SEM
-- file_size_limit e SEM allowed_mime_types. Um agente pode enviar um arquivo de tipo arbitrario
-- (ex. text/html) e a URL publica serve o conteudo sem JWT (pagina hospedada no dominio do storage),
-- alem de nao haver teto de custo/armazenamento por upload. Correcao = os mesmos limites que ja
-- existem em custom-emojis (512000 bytes + lista de MIME); so o bucket de imagem/audio compartilhado,
-- nao os de midia de cliente (whatsapp-media/audio-messages/team-chat-files continuam privados).
--
-- SEC-DEFINER_GRANTS_STORAGE-08 (P3): em team-chat-files o INSERT grava a pasta com
-- public.current_profile_id() (migration 20260928560000), mas o SELECT/DELETE comparavam a mesma
-- pasta com auth.uid() (id do USUARIO, nao do profile). Como profiles.id <> profiles.user_id, o
-- dono do arquivo nao conseguia listar nem apagar o proprio envio. Aqui a identidade fica a mesma
-- nos tres verbos: a pasta e comparada com public.current_profile_id(). O ramo de membro da
-- conversa (p.user_id = auth.uid()) e o ramo de admin (is_admin_or_supervisor(auth.uid())) NAO mudam:
-- eles comparam com o id de usuario de proposito.

UPDATE storage.buckets
   SET file_size_limit = 512000,
       allowed_mime_types = ARRAY['image/png', 'image/webp', 'image/gif', 'image/jpeg']
 WHERE id = 'stickers';

UPDATE storage.buckets
   SET file_size_limit = 512000,
       allowed_mime_types = ARRAY['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac']
 WHERE id = 'audio-memes';

DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;

-- O ramo de dono deixa de comparar a pasta com auth.uid() e passa a comparar com o profile do
-- chamador (public.current_profile_id()), a MESMA identidade que a policy de INSERT usa.
CREATE POLICY "Conversation members can read team chat files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (
      (storage.foldername(name))[1] = (public.current_profile_id())::text
      OR is_admin_or_supervisor(auth.uid())
      OR EXISTS (
        SELECT 1
          FROM public.team_messages tm
          JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
          JOIN public.profiles p ON p.id = mem.profile_id
         WHERE tm.media_bucket = 'team-chat-files'
           AND tm.media_path = name
           AND p.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;

CREATE POLICY "Users can delete own team chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (storage.foldername(name))[1] = (public.current_profile_id())::text
  );
