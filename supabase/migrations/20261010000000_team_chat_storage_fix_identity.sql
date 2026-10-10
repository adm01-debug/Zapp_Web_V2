-- Rollback: DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;
-- Rollback: DROP POLICY IF EXISTS "Team chat file owner can delete" ON storage.objects;
-- Rollback: DROP POLICY IF EXISTS "Admins can delete any team chat file" ON storage.objects;
-- Rollback: CREATE POLICY "Users can delete own team chat files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'team-chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Fix team-chat-files storage policies: SELECT and DELETE must use
-- current_profile_id()::text consistently, matching the INSERT policy
-- that stores files in folders named by profile UUID.
-- Previously SELECT compared folder name to auth.uid()::text (user UUID)
-- while INSERT used current_profile_id() (profile UUID) — the sender
-- could not read or delete their own file because the IDs differed.

-- 1. Fix SELECT policy: folder comparison must use current_profile_id()::text
DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;

CREATE POLICY "Conversation members can read team chat files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND (
    (storage.foldername(name))[1] = (public.current_profile_id())::text
    OR is_admin_or_supervisor(public.current_profile_id())
    OR EXISTS (
      SELECT 1 FROM public.team_messages tm
      JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
      JOIN public.profiles p ON p.id = mem.profile_id
      WHERE tm.media_bucket = 'team-chat-files'
        AND tm.media_path = name
        AND p.user_id = public.current_profile_id()
    )
  )
);

-- 2. Create DELETE policy: owner can delete their own files
DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;

CREATE POLICY "Team chat file owner can delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND (storage.foldername(name))[1] = (public.current_profile_id())::text
);

-- 3. Admin/supervisor override for DELETE
DROP POLICY IF EXISTS "Admins can delete any team chat file" ON storage.objects;

CREATE POLICY "Admins can delete any team chat file"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND is_admin_or_supervisor(public.current_profile_id())
);
