
-- 1. Fix whatsapp-media INSERT
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

CREATE POLICY "Users can upload assigned whatsapp media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- 2. Fix audio-messages INSERT
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload audio messages" ON storage.objects;

CREATE POLICY "Users can upload assigned audio messages"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- 3. Remove conflicting open achievement SELECT
DROP POLICY IF EXISTS "Authenticated can view achievements" ON public.agent_achievements;
