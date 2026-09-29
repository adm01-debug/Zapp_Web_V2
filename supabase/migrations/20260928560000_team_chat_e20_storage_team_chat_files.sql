-- Objetivo: Policy de upload no bucket team-chat-files limitada ao próprio folder do usuário
-- Estado ao vivo antes: políticas antigas conflitantes
-- Rollback: DROP POLICY team_chat_files_insert ON storage.objects

DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;
REVOKE UPDATE ON storage.objects FROM authenticated;
DROP POLICY IF EXISTS "Users can upload to own folder in team-chat-files" ON storage.objects;

CREATE POLICY team_chat_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-chat-files'
    AND (storage.foldername(name))[1] = (public.current_profile_id())::text
  );
