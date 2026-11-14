SET LOCAL lock_timeout = '3s'

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects

CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid()) IS TRUE
      AND (
                m.contact_id::text = (storage.foldername(objects.name))[1]
                                OR (m.sender = 'contact' AND (storage.foldername(objects.name))[1] = m.message_type)
      )
      AND (
        right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
          = '/' || objects.bucket_id || '/' || objects.name
        OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
        OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
          = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
        OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
      )
  )
)
