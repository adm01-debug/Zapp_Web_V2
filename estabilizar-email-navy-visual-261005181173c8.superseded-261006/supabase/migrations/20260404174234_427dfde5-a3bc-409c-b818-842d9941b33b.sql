
-- Recreate the team chat files SELECT policy with qualified column names
DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;
DROP POLICY IF EXISTS "Team chat files readable by owner or admin" ON storage.objects;

CREATE POLICY "Team chat files readable by owner admin or conversation member"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND (
    (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
    OR public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm1
      JOIN public.profiles p1 ON p1.id = tcm1.profile_id AND p1.user_id = auth.uid()
      JOIN public.team_conversation_members tcm2 ON tcm2.conversation_id = tcm1.conversation_id
      JOIN public.profiles p2 ON p2.id = tcm2.profile_id AND p2.user_id::text = (storage.foldername(storage.objects.name))[1]
    )
  )
);
