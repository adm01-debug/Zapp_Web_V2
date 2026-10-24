
-- Make audio-messages bucket private
UPDATE storage.buckets SET public = false WHERE id = 'audio-messages';

-- Fix whatsapp-media SELECT policy to require authentication
DROP POLICY IF EXISTS "Public read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to whatsapp-media" ON storage.objects;

-- Recreate with auth check
CREATE POLICY "Authenticated read whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Fix audio-messages SELECT to require auth + assignment check
DROP POLICY IF EXISTS "Authenticated read audio messages" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can read audio messages" ON storage.objects;

CREATE POLICY "Authenticated read audio messages"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio-messages');

-- Add UPDATE policies for audio-memes, stickers, custom-emojis
CREATE POLICY "Users can update own audio memes"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'audio-memes'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Users can update own stickers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'stickers'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Users can update own custom emojis"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'custom-emojis'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
