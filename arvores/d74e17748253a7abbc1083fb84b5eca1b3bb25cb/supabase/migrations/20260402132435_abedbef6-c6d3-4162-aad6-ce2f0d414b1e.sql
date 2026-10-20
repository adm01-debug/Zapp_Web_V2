-- Add media support columns to team_messages
ALTER TABLE public.team_messages
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Create storage bucket for team chat files
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-chat-files', 'team-chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Team chat files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-chat-files');

CREATE POLICY "Authenticated users can upload team chat files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'team-chat-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own team chat files"
ON storage.objects FOR DELETE
USING (bucket_id = 'team-chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);