-- r2_db_022_storage_acl
-- Rollback: executar este bloco (recria as três policies originais, de
--   20260930700000_fix_whatsapp_storage_policies e
--   20261003142707_whatsapp_media_recebida_select_via_messages):
--
--   DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;
--
--   CREATE POLICY "Users can read assigned whatsapp media"
--     ON storage.objects FOR SELECT TO authenticated USING (
--       bucket_id = 'whatsapp-media'
--       AND (
--         is_admin_or_supervisor(auth.uid())
--         OR (storage.foldername(name))[1] IN (
--           SELECT c.id::text FROM public.contacts c
--           WHERE c.assigned_to IN (
--             SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--           )
--         )
--         OR EXISTS (
--           SELECT 1 FROM public.messages m
--           JOIN public.contacts c ON c.id = m.contact_id
--           WHERE m.media_url LIKE '%/' || objects.name
--             AND c.assigned_to IN (
--               SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--             )
--         )
--         OR (storage.foldername(name))[1] = auth.uid()::text
--       )
--     );
--
--   CREATE POLICY "Users can read assigned audio messages"
--     ON storage.objects FOR SELECT TO authenticated USING (
--       bucket_id = 'audio-messages'
--       AND (
--         is_admin_or_supervisor(auth.uid())
--         OR (storage.foldername(name))[1] IN (
--           SELECT c.id::text FROM public.contacts c
--           WHERE c.assigned_to IN (
--             SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--           )
--         )
--         OR EXISTS (
--           SELECT 1 FROM public.messages m
--           JOIN public.contacts c ON c.id = m.contact_id
--           WHERE m.media_url LIKE '%/' || objects.name
--             AND c.assigned_to IN (
--               SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--             )
--         )
--       )
--     );
--
--   CREATE POLICY "whatsapp media readable via visible message"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (
--     objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
--     AND EXISTS (
--       SELECT 1
--       FROM public.messages m
--       WHERE m.media_url IS NOT NULL
--         AND (
--           right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
--             = '/' || objects.bucket_id || '/' || objects.name
--           OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
--           OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
--             = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
--           OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
--         )
--     )
--   );
--
-- R2-DB-022 B1 — fecha a ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- A recusa da rodada anterior aceitou o fechamento da brecha de media_url/LIKE,
-- mas apontou regressão: o diff retirou leituras legítimas que já existiam para
-- agentes. Esta versão remove a policy aditiva baseada em referência forjável e
-- recria as duas policies dos buckets com regras canônicas explícitas por formato
-- de objeto, sem SECURITY DEFINER e sem GRANT.
--
-- Regras mantidas/fechadas:
--   * agente lê objeto cujo primeiro segmento é contact_id visível;
--   * admin/supervisor mantém o acesso já previsto ao bucket;
--   * whatsapp-media/<auth.uid()>/... continua legível pelo próprio usuário;
--   * áudio do ChatPopup em audio_<contactId>_<ts>.webm é autorizado pelo
--     contact_id embutido no nome, não por media_url;
--   * kb/ e stickers/ (whatsapp-media) e custom-sounds/ (audio-messages) ficam
--     legíveis a authenticated como assets funcionais, sem ampliar escrita/listagem;
--   * mídia recebida legada sem prefixo passa apenas quando há mensagem recebida
--     visível, com sender='contact', external_id presente e comparação EXATA do
--     bucket/path extraído de um locator de storage sem query/encoding ambíguo;
--   * não há LIKE de sufixo, right/position/replace, wildcard %, query string ou
--     bucket divergente para conceder leitura.
--
-- Escopo: só as três policies SELECT dos buckets whatsapp-media e audio-messages.

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;

CREATE POLICY "Users can read assigned whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'whatsapp-media'
  AND (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
    OR (storage.foldername(objects.name))[1] = auth.uid()::text
    OR (
      objects.name ~ '^audio_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9]+[.]webm$'
      AND EXISTS (
        SELECT 1
        FROM public.contacts c
        WHERE c.id::text = substring(objects.name from '^audio_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_[0-9]+[.]webm$')
          AND public.is_contact_visible_to_user(c.id, auth.uid())
      )
    )
    OR (storage.foldername(objects.name))[1] IN ('kb', 'stickers')
    OR (
      (storage.foldername(objects.name))[1] IN ('image', 'video', 'document', 'audio', 'sticker')
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
        WHERE m.sender = 'contact'
          AND m.external_id IS NOT NULL
          AND public.is_contact_visible_to_user(c.id, auth.uid())
          AND (regexp_match(m.media_url, '^https://[^/?#]+/storage/v1/object/public/(whatsapp-media|audio-messages)/([^?#%]+)$'))[1] = objects.bucket_id
          AND (regexp_match(m.media_url, '^https://[^/?#]+/storage/v1/object/public/(whatsapp-media|audio-messages)/([^?#%]+)$'))[2] = objects.name
      )
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
      SELECT 1
      FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
    OR (storage.foldername(objects.name))[1] = auth.uid()::text
    OR (storage.foldername(objects.name))[1] = 'custom-sounds'
    OR (
      (storage.foldername(objects.name))[1] = 'audio'
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
        WHERE m.sender = 'contact'
          AND m.external_id IS NOT NULL
          AND public.is_contact_visible_to_user(c.id, auth.uid())
          AND (regexp_match(m.media_url, '^https://[^/?#]+/storage/v1/object/public/(whatsapp-media|audio-messages)/([^?#%]+)$'))[1] = objects.bucket_id
          AND (regexp_match(m.media_url, '^https://[^/?#]+/storage/v1/object/public/(whatsapp-media|audio-messages)/([^?#%]+)$'))[2] = objects.name
      )
    )
  )
);
