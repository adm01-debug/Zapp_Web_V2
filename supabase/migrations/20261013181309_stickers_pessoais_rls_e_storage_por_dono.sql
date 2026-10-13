-- 20261013181309_stickers_pessoais_rls_e_storage_por_dono
-- Rollback: restaura as policies originais de public.stickers e de storage.objects (bucket 'stickers'), voltando ao estado em que qualquer authenticated enxerga toda figurinha.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Authenticated users can view stickers" on public.stickers;
--   drop policy if exists "Sticker insert with ownership" on public.stickers;
--   drop policy if exists "Sticker update with ownership" on public.stickers;
--   drop policy if exists "Sticker delete with ownership" on public.stickers;
--   create policy "Authenticated users can view stickers" on public.stickers for select to authenticated using (true);
--   create policy "Sticker insert with ownership" on public.stickers for insert to authenticated with check (uploaded_by = (auth.uid())::text or public.is_admin_or_supervisor(auth.uid()));
--   create policy "Sticker update with ownership" on public.stickers for update to authenticated using (uploaded_by = (auth.uid())::text or public.is_admin_or_supervisor(auth.uid())) with check (uploaded_by = (auth.uid())::text or public.is_admin_or_supervisor(auth.uid()));
--   create policy "Sticker delete with ownership" on public.stickers for delete to authenticated using (uploaded_by = (auth.uid())::text or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Stickers visible to owner or shared" on storage.objects;
--   drop policy if exists "Auth upload stickers owned" on storage.objects;
--   drop policy if exists "Users can update own stickers" on storage.objects;
--   drop policy if exists "Users can delete own stickers" on storage.objects;
--   create policy "Anyone can view stickers" on storage.objects for select to authenticated using (bucket_id = 'stickers'::text);
--   create policy "Auth upload stickers owned" on storage.objects for insert to authenticated with check ((bucket_id = 'stickers'::text) and (public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::text));
--   create policy "Users can update own stickers" on storage.objects for update to authenticated using ((bucket_id = 'stickers'::text) and (public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::text));
--   create policy "Users can delete own stickers" on storage.objects for delete to authenticated using ((bucket_id = 'stickers'::text) and (storage.foldername(name))[1] = (auth.uid())::text);
--
-- Figurinha pessoal nao pode vazar para a biblioteca compartilhada, e o dono (nao-admin)
-- precisa subir/ver/excluir a propria figurinha — no banco e no bucket 'stickers'.
--
-- Contrato real do app (src/hooks/integrations/usePersonalStickers.ts e
-- src/hooks/sticker-picker/useStickerPicker.ts):
--   * pessoal:   linha com owner_id = profiles.id e uploaded_by = profiles.id;
--                objeto em 'pessoal/<profiles.id>/<uuid>.<ext>';
--   * compartilhada: linha com owner_id IS NULL e uploaded_by = auth.uid();
--                objeto 'sticker_<ts>_<uuid>.<ext>' (nome de arquivo, sem pasta).
--
-- Como profiles.id <> auth.uid() no Supabase deste projeto, o dono e resolvido por
-- public.get_profile_id_for_user(auth.uid()) (SECURITY DEFINER, corpo em 20251215024517).
-- As policies antigas comparavam com auth.uid() (uploaded_by / foldername[1]) e por isso
-- nem o dono nao-admin conseguia manter a propria figurinha pessoal.
--
-- Sem GRANT novo: nada de tabela/coluna/funcao criada; so policies de RLS trocadas.

-- ===== public.stickers =====

-- 1. SELECT: compartilhada (owner_id IS NULL) para todo authenticated; pessoal so para o dono
--    ou admin/supervisor. Era USING (true) (20260317234558) — o vazamento da biblioteca.
drop policy if exists "Authenticated users can view stickers" on public.stickers;
create policy "Authenticated users can view stickers" on public.stickers
  for select to authenticated
  using (
    owner_id is null
    or owner_id = public.get_profile_id_for_user(auth.uid())
    or public.is_admin_or_supervisor(auth.uid())
  );

-- 2. INSERT: pessoal so para o dono; compartilhada segue com uploaded_by = auth.uid().
drop policy if exists "Sticker insert with ownership" on public.stickers;
create policy "Sticker insert with ownership" on public.stickers
  for insert to authenticated
  with check (
    public.is_admin_or_supervisor(auth.uid())
    or owner_id = public.get_profile_id_for_user(auth.uid())
    or (owner_id is null and uploaded_by = (auth.uid())::text)
  );

-- 3. UPDATE: mesmo escopo (dono da pessoal, autor da compartilhada, admin). Necessario para
--    favoritar/usar a propria figurinha pessoal.
drop policy if exists "Sticker update with ownership" on public.stickers;
create policy "Sticker update with ownership" on public.stickers
  for update to authenticated
  using (
    public.is_admin_or_supervisor(auth.uid())
    or owner_id = public.get_profile_id_for_user(auth.uid())
    or (owner_id is null and uploaded_by = (auth.uid())::text)
  )
  with check (
    public.is_admin_or_supervisor(auth.uid())
    or owner_id = public.get_profile_id_for_user(auth.uid())
    or (owner_id is null and uploaded_by = (auth.uid())::text)
  );

-- 4. DELETE: mesmo escopo.
drop policy if exists "Sticker delete with ownership" on public.stickers;
create policy "Sticker delete with ownership" on public.stickers
  for delete to authenticated
  using (
    public.is_admin_or_supervisor(auth.uid())
    or owner_id = public.get_profile_id_for_user(auth.uid())
    or (owner_id is null and uploaded_by = (auth.uid())::text)
  );

-- ===== storage.objects (bucket 'stickers') =====
-- Dono do objeto = public.get_profile_id_for_user(auth.uid()).
-- Caminhos aceitos para o dono: 'pessoal/<profiles.id>/...' e '<auth.uid()>/...'.
-- O bucket segue público (o app envia o publicUrl da figurinha compartilhada); o que muda
-- e a LISTAGEM via API: o objeto pessoal de terceiro deixa de aparecer.

-- 5. SELECT: compartilhado/raiz e '<auth.uid()>/...' para authenticated; pasta pessoal so
--    para o dono ou admin/supervisor.
drop policy if exists "Anyone can view stickers" on storage.objects;
drop policy if exists "Stickers visible to owner or shared" on storage.objects;
create policy "Stickers visible to owner or shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stickers'::text
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] is distinct from 'pessoal'
      or (storage.foldername(name))[2] = (public.get_profile_id_for_user(auth.uid()))::text
    )
  );

-- 6. INSERT: mantem '<auth.uid()>/...' (ja existia) e libera a pasta pessoal para o dono.
drop policy if exists "Auth upload stickers owned" on storage.objects;
create policy "Auth upload stickers owned" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stickers'::text
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'pessoal'
        and (storage.foldername(name))[2] = (public.get_profile_id_for_user(auth.uid()))::text
      )
    )
  );

-- 7. UPDATE: mesmo escopo do INSERT.
drop policy if exists "Users can update own stickers" on storage.objects;
create policy "Users can update own stickers" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'stickers'::text
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'pessoal'
        and (storage.foldername(name))[2] = (public.get_profile_id_for_user(auth.uid()))::text
      )
    )
  )
  with check (
    bucket_id = 'stickers'::text
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'pessoal'
        and (storage.foldername(name))[2] = (public.get_profile_id_for_user(auth.uid()))::text
      )
    )
  );

-- 8. DELETE: dono exclui o proprio objeto ('<auth.uid()>/...' ou pasta pessoal); sem abrir
--    para terceiros. Sem ramo de admin, como no estado original.
drop policy if exists "Users can delete own stickers" on storage.objects;
create policy "Users can delete own stickers" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stickers'::text
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'pessoal'
        and (storage.foldername(name))[2] = (public.get_profile_id_for_user(auth.uid()))::text
      )
    )
  );
