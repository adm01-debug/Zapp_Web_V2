-- E21: Add SELECT policy on team-chat-files storage bucket for conversation members
-- The INSERT/DELETE policies already enforce auth.uid() folder path correctly.
-- This adds the missing SELECT policy so recipients can sign/download files they received.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('team-chat-files', 'team-chat-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Conversation members can read team chat files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'team-chat-files'
    AND (
      -- File owner
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      -- Any member of a conversation that references this file
      is_admin_or_supervisor(auth.uid())
      OR
      EXISTS (
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
