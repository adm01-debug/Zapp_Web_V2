-- higiene_grants_public_policies
-- Rollback: GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO PUBLIC, anon, authenticated; SELECT 1;
-- O rollback reverte somente o GRANT. Nao recria policies removidas: a SELECT
-- legada amplia leitura e a DELETE sem auth.uid()/foldername permite excluir
-- avatares de terceiros. Reversao dessas policies exige uma migration segura.
--
-- Higiene de grants (docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md).
-- Nenhuma linha de dado e tocada: so ACL de funcao e policies de storage.objects.
--
-- 1. public.multiplix_audiences_validate_shared_roles() e uma funcao de TRIGGER (BEFORE
--    INSERT OR UPDATE em public.multiplix_audiences, criada em 20261001261230_f35). Nasceu
--    depois da varredura que fechou as outras 324 rotinas e por isso ficou com o EXECUTE
--    padrao do Postgres em PUBLIC. O gatilho roda como o dono da funcao e NAO checa EXECUTE
--    do papel que dispara o INSERT/UPDATE, entao revogar nao quebra o trigger — mas deixa de
--    expor a rotina a qualquer login (anon/authenticated). service_role segue com EXECUTE
--    (nao pedido, preservado).
--
-- 2. Policies de storage.objects com predicado identico no MESMO bucket+verbo: permissivas se
--    somam por OR e dificultam a revisao; se o bucket virar privado, a policy esquecida segue
--    liberando. Fica uma por verbo/bucket:
--      - avatars SELECT: "Anyone can view avatars" (mantida) x "Avatar images are publicly
--        accessible" (redundante, removida).
--      - avatars DELETE: "Users can delete their own avatar" (mantida) x "Users can delete
--        their own avatars" (redundante, removida).
--    Conferido no retrato do banco e no BLOCO_03 da exportacao: stickers, audio-memes e
--    custom-emojis tem UMA unica policy de SELECT cada ("Anyone can view stickers",
--    "Public read audio memes", "Public read for custom emojis") — nada a remover ali; o
--    teste prova o "uma por verbo/bucket" nos QUATRO buckets.

-- 1. EXECUTE da funcao de trigger
REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles()
  FROM PUBLIC, anon, authenticated;

-- 2. policies duplicadas (so as redundantes; a canonica de cada par fica)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
