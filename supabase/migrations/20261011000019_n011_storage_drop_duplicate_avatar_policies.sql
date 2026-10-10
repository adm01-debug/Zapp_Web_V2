-- n011_storage_drop_duplicate_avatar_policies
-- Rollback: CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'avatars'::text)); CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- Rollback (SQL executável, na ordem):
--   CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'avatars'::text));
--   CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- N-011 (P2 · banco, inventario A4): dedup de policies de leitura e exclusao em
-- storage.objects para o bucket avatars. A migration de origem
-- 20260511233306 cria DOIS pares com USING identico: no DELETE, a singular
-- "Users can delete their own avatar" (original da 20260306) e a plural
-- "Users can delete their own avatars" (criada na 20260404 e recriada na origem);
-- no SELECT, "Anyone can view avatars" e "Avatar images are publicly accessible"
-- (ambas USING (bucket_id = 'avatars')). Policies permissivas combinam por OR,
-- entao remover um dos lados de cada par identico nao muda o acesso efetivo.
-- Mantidas: a singular no DELETE e "Anyone can view avatars" no SELECT (nomes
-- originais da criacao do bucket). Figurinha (stickers), meme (audio-memes) e
-- emoji (custom-emojis) ja tem UMA policy por verbo de leitura/exclusao na
-- origem (20260511233306:25,29,49,53,65,73,77,85) e nenhuma migration posterior
-- da branch do dia cria outra para esses buckets — nada a apagar neles.

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
