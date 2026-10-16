-- whatsapp_media_policies_sem_curinga_like
-- Rollback: recria "Users can read assigned whatsapp media" e "Users can read assigned audio messages" com o corpo anterior (LIKE '%/' || objects.name), que é o único trecho alterado aqui.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Users can read assigned whatsapp media" on storage.objects;
--   create policy "Users can read assigned whatsapp media" on storage.objects for select to authenticated using (bucket_id = 'whatsapp-media' and (is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] in (select c.id::text from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or exists (select 1 from public.messages m join public.contacts c on c.id = m.contact_id where m.media_url like '%/' || objects.name and c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or (storage.foldername(name))[1] = auth.uid()::text));
--   drop policy if exists "Users can read assigned audio messages" on storage.objects;
--   create policy "Users can read assigned audio messages" on storage.objects for select to authenticated using (bucket_id = 'audio-messages' and (is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] in (select c.id::text from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or exists (select 1 from public.messages m join public.contacts c on c.id = m.contact_id where m.media_url like '%/' || objects.name and c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid()))));
--
-- SEC-DEFINER_GRANTS_STORAGE-02 (docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md):
-- as policies de SELECT de storage.objects criadas em 20260930700000 comparavam o locator da
-- mensagem com o nome do objeto usando LIKE '%/' || objects.name. O nome do objeto vira PADRÃO:
-- '%' e '_' deixam de ser literais e o EXISTS casa com o media_url de um objeto DIFERENTE. Um
-- agente atribuído ao contato dono de `.../image/foto-2026.jpg` podia ler `image/foto_2026.jpg`
-- (o `_` casou o `-`) — arquivo sem vínculo com nenhuma mensagem dele.
--
-- Correção: troca SÓ o ramo EXISTS, pela comparação EXATA (`right(...)`/`position(...)`) já usada
-- na policy aditiva de 20261003142707 ("whatsapp media readable via visible message"). Os demais
-- ramos (admin/supervisor, pasta do contato atribuído, pasta = auth.uid()) e o JOIN com contacts
-- que confere a atribuição ficam IGUAIS. As duas policies são recriadas com o MESMO nome (o DROP
-- é do próprio nome, então o replay é idempotente). Nenhuma policy nova é criada ou removida.
--
-- CLASSE: contrato (contém drop policy) — aplicar depois do merge/deploy.

DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
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
        WHERE m.media_url IS NOT NULL
          AND (
            right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
              = '/' || objects.bucket_id || '/' || objects.name
            OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
            OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
              = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
            OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
          )
          AND c.assigned_to IN (
            SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
          )
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;
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
        WHERE m.media_url IS NOT NULL
          AND (
            right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
              = '/' || objects.bucket_id || '/' || objects.name
            OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
            OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
              = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
            OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
          )
          AND c.assigned_to IN (
            SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
          )
      )
    )
  );
