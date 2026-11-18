CREATE INDEX IF NOT EXISTS idx_messages_media_url_trgm
  ON public.messages USING gin (media_url extensions.gin_trgm_ops)
  WHERE media_url IS NOT NULL

DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects

CREATE POLICY "Users can read assigned whatsapp media"
  ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'whatsapp-media'
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM public.contacts c
        WHERE c.assigned_to IN (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
        WHERE m.media_url LIKE '%/' || objects.name
          AND c.assigned_to IN (
            SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
          )
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  )

DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects

CREATE POLICY "Users can read assigned audio messages"
  ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'audio-messages'
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM public.contacts c
        WHERE c.assigned_to IN (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
        WHERE m.media_url LIKE '%/' || objects.name
          AND c.assigned_to IN (
            SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
          )
      )
    )
  )
