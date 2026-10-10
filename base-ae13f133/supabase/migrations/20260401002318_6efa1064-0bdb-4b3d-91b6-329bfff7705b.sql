
-- Fix audio-messages: Replace broad SELECT with ownership-scoped policy
DROP POLICY IF EXISTS "Authenticated users can view audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read audio messages" ON storage.objects;

CREATE POLICY "Users can read assigned audio messages"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

-- Fix storage INSERT with path ownership enforcement
DROP POLICY IF EXISTS "Auth upload audio memes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload stickers" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload custom emojis" ON storage.objects;

CREATE POLICY "Auth upload audio memes owned"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-memes'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Auth upload stickers owned"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'stickers'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Auth upload custom emojis owned"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'custom-emojis'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
