
-- Fix storage DELETE policies for stickers, audio-memes, custom-emojis
-- These buckets don't use user-id folder prefix, so the old policy always fails
DROP POLICY IF EXISTS "Users can delete own stickers" ON storage.objects;
CREATE POLICY "Authenticated users can delete stickers"
ON storage.objects FOR DELETE
USING (bucket_id = 'stickers' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own audio memes" ON storage.objects;
CREATE POLICY "Authenticated users can delete audio memes"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-memes' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own custom emojis" ON storage.objects;
CREATE POLICY "Authenticated users can delete custom emojis"
ON storage.objects FOR DELETE
USING (bucket_id = 'custom-emojis' AND auth.role() = 'authenticated');

-- Also fix audio-messages bucket for deletion
DROP POLICY IF EXISTS "Users can delete own audio messages" ON storage.objects;
CREATE POLICY "Authenticated users can delete audio messages"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-messages' AND auth.role() = 'authenticated');
