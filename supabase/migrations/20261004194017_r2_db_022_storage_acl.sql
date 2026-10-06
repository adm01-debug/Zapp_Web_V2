-- r2_db_022_storage_acl
-- Rollback: executar o bloco SQL comentado abaixo; ele restaura integralmente as três policies anteriores.
-- DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;
-- CREATE POLICY "Users can read assigned whatsapp media"
--   ON storage.objects FOR SELECT TO authenticated USING (
--     bucket_id = 'whatsapp-media' AND (
--       is_admin_or_supervisor(auth.uid())
--       OR (storage.foldername(name))[1] IN (
--         SELECT c.id::text FROM public.contacts c
--         WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
--       OR EXISTS (
--         SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
--         WHERE m.media_url LIKE '%/' || objects.name
--           AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
--       OR (storage.foldername(name))[1] = auth.uid()::text));
-- CREATE POLICY "Users can read assigned audio messages"
--   ON storage.objects FOR SELECT TO authenticated USING (
--     bucket_id = 'audio-messages' AND (
--       is_admin_or_supervisor(auth.uid())
--       OR (storage.foldername(name))[1] IN (
--         SELECT c.id::text FROM public.contacts c
--         WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
--       OR EXISTS (
--         SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
--         WHERE m.media_url LIKE '%/' || objects.name
--           AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))));
-- CREATE POLICY "whatsapp media readable via visible message"
--   ON storage.objects FOR SELECT TO authenticated USING (
--     objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
--     AND EXISTS (
--       SELECT 1 FROM public.messages m WHERE m.media_url IS NOT NULL AND (
--         right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
--           = '/' || objects.bucket_id || '/' || objects.name
--         OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
--         OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
--           = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
--         OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0)));

-- A associação recebida só é confiável depois que a migration irmã de escrita
-- torna os campos de proveniência imutáveis para authenticated. Falhar fechado
-- evita instalar a ACL isoladamente numa ordem insegura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class r ON r.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE t.tgname = 'trg_guard_message_provenance_fields'
      AND n.nspname = 'public' AND r.relname = 'messages' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'r2_db_022_write_boundary_required' USING ERRCODE = '55000';
  END IF;
END $$;

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;

-- Mídia recebida legada: origem imutável, contato visível e locator HTTPS integral.
-- A igualdade literal mantém '_' literal; '%' é rejeitado por ser encoding ambíguo.
CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  (
    (objects.bucket_id = 'whatsapp-media'
      AND (storage.foldername(objects.name))[1] IN ('image', 'video', 'document', 'sticker'))
    OR (objects.bucket_id = 'audio-messages'
      AND (storage.foldername(objects.name))[1] = 'audio')
  )
  AND position('%' IN objects.name) = 0
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.sender = 'contact'
      AND m.external_id IS NOT NULL
      AND m.contact_id IS NOT NULL
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
      AND position('%' IN m.media_url) = 0
      AND m.media_url = COALESCE(
        substring(m.media_url FROM '^https://[A-Za-z0-9.-]+:[0-9]+'),
        substring(m.media_url FROM '^https://[A-Za-z0-9.-]+')
      ) || '/storage/v1/object/public/' || objects.bucket_id || '/' || objects.name
  )
);

-- Mídia criada/copiada por agente: o primeiro segmento é o contato visível.
CREATE POLICY "Users can read assigned whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'whatsapp-media'
  AND (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
  )
);

CREATE POLICY "Users can read assigned audio messages"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'audio-messages'
  AND (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
  )
);
