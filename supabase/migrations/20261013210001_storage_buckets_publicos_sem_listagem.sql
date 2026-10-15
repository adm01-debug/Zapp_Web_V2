-- storage_buckets_publicos_sem_listagem
-- Rollback: dropa as 3 policies de SELECT criadas aqui e recria as 4 policies de SELECT (listagem) removidas, exatamente como estavam.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Avatares: dono le a propria pasta" ON storage.objects;
--   DROP POLICY IF EXISTS "Stickers: admin le o catalogo" ON storage.objects;
--   DROP POLICY IF EXISTS "Emojis: admin le o catalogo" ON storage.objects;
--   CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
--   CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
--   CREATE POLICY "Anyone can view stickers" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'stickers');
--   CREATE POLICY "Public read for custom emojis" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'custom-emojis');
--
-- PD-67 (paridade V3 -> V2, docs/estado). avatars, stickers e custom-emojis são buckets
-- PÚBLICOS por design (public=true) e a leitura é por URL direta (getPublicUrl; o app não
-- usa createSignedUrl nem list() nesses buckets — só em PRIVATE_MEDIA_BUCKETS de
-- src/lib/storage_object_reference.ts). O defeito era a LISTAGEM: as 4 policies de SELECT
-- abaixo tinham predicado só `bucket_id = '<bucket>'` TO authenticated, então qualquer
-- usuário autenticado enumerava o bucket inteiro (avatar de todo mundo, figurinha e emoji
-- de todos), o que anula a barreira do nome aleatório da URL.
--
-- Correção: some a listagem do bucket. Em avatars fica só UMA policy de SELECT, com
-- predicado de PASTA DO DONO ((storage.foldername(name))[1] = auth.uid()): não enumera
-- nada alheio (SELECT * volta só o próprio avatar). Ela existe porque o upsert do avatar
-- ("Alterar foto", AvatarUpload.tsx, upload(..., { upsert: true }) em `<uid>/avatar.<ext>`)
-- reusa a linha existente, e RLS exige uma policy de SELECT para o UPDATE/DELETE enxergar
-- a linha — sem nenhum SELECT o reenvio da foto e a remoção da foto do próprio usuário
-- falhariam. Em stickers e custom-emojis entra UMA policy de SELECT restrita a
-- admin/supervisor (is_admin_or_supervisor(auth.uid())): sem ela, o UPDATE do catálogo
-- pelo admin (policies "Users can update own stickers/custom emojis", que têm ramo admin
-- no USING) afetaria 0 linhas, porque RLS exige SELECT para o UPDATE enxergar a linha
-- (acoplamento provado: sem esta policy o UPDATE do admin volta 0 linhas). Ela NÃO abre
-- listagem a authenticated comum: o predicado só passa para admin/supervisor.
-- A URL pública continua servindo o objeto (bucket public=true não passa por RLS no
-- caminho /object/public).
--
-- As policies de ESCRITA ficam como estão: INSERT/UPDATE/DELETE seguem restritos ao dono da
-- pasta ((storage.foldername(name))[1] = auth.uid()) ou ao admin/supervisor no catálogo
-- compartilhado (figurinhas e emojis têm caminho de topo, sem pasta do dono) ou ao
-- service_role, que tem BYPASSRLS. Nenhum GRANT/ACL é alterado aqui.

SET search_path = public, pg_catalog;

-- Sai a listagem aberta a qualquer autenticado.
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
DROP POLICY IF EXISTS "Public read for custom emojis" ON storage.objects;

-- Entra só a leitura da PRÓPRIA pasta em avatars (preserva o upsert e o DELETE do dono; não lista o bucket).
CREATE POLICY "Avatares: dono le a propria pasta"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Entra a leitura do catálogo SÓ para admin/supervisor em stickers e custom-emojis
-- (preserva o UPDATE do catálogo pelo admin; authenticated comum segue sem listar).
CREATE POLICY "Stickers: admin le o catalogo"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'stickers' AND is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Emojis: admin le o catalogo"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'custom-emojis' AND is_admin_or_supervisor(auth.uid()));
