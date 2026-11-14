-- reaplica_parciais_comments_team_chat_delete
--
-- Por que existe: o ledger (supabase_migrations.schema_migrations) registrou as versoes
-- 20261006234158 (whatsapp_default_connection_rpc_atomica) e 20261011010002
-- (bucket_limits_e_team_chat_files_identidade) com statements NULL, e o estado vivo de
-- producao bate so em parte com os arquivos. Esta migration reaplica SO as partes que
-- faltam e que continuam sendo o pretendido.
-- Prova (SELECT em producao, 2026-11-14):
--   SELECT version, array_length(statements,1) FROM supabase_migrations.schema_migrations
--    WHERE version IN ('20261006234158','20261011010002');
--   -> 20261006234158 | NULL ; 20261011010002 | NULL
--   SELECT obj_description('public.set_default_whatsapp_connection(uuid)'::regprocedure,'pg_proc');
--   -> NULL   (o arquivo cria o COMMENT TRA-004)
--   md5(prosrc) vivo = 3429b060350fcda980aeff5912b1b400 = md5 do corpo do arquivo sem as
--   linhas de comentario; proacl = {postgres=X/postgres,authenticated=X/postgres};
--   SECURITY DEFINER + search_path=public, pg_temp  -> funcao e ACL ja aplicadas.
--   SELECT qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
--    AND policyname='Users can delete own team chat files';
--   -> ((bucket_id = 'team-chat-files') AND ((storage.foldername(name))[1] =
--       ANY (ARRAY[(current_profile_id())::text, (auth.uid())::text])))
--   (definicao de 20261007010651; o arquivo 20261011010002 exige so current_profile_id()
--    e nenhuma migration posterior redefine esta policy).
--   Objetos legados em pasta auth.uid() no bucket: SELECT count(*) FROM storage.objects
--    WHERE bucket_id='team-chat-files' -> 0 (0 em pasta profile, 0 em pasta auth.uid()).
--
-- O que faz:
--   1) COMMENT ON FUNCTION set_default_whatsapp_connection(uuid): texto byte-identico ao
--      de 20261006234158. Funcao, SECURITY DEFINER, search_path e ACL nao sao tocados.
--   2) Policy DELETE "Users can delete own team chat files": recriada exatamente como em
--      20261011010002 (dono = public.current_profile_id(), mesma identidade da policy de
--      INSERT team_chat_files_insert). Fecha o ramo auth.uid(): pasta com o id de usuario
--      nunca e gravada pelo app (src/hooks/team-chat/uploadTeamMedia.ts usa profile_id) e
--      nao ha objeto legado. "Admins can delete team chat files" nao muda.
--
-- O que NAO faz (de proposito):
--   * COMMENT de talk_me_list_pending_messages (20261011010003, tambem ausente): fica com
--     20261113170500_reaplica_talk_me_pending_history, que reaplica 20261011010100 e
--     grava o COMMENT novo da v2 — duplicar aqui sobrescreveria um com o outro.
--   * Policy SELECT "Conversation members can read team chat files": substituida
--     legitimamente por "Team chat files readable by owner admin or conversation member"
--     (20261013235908); recria-la reabriria a leitura antiga.
--   * Limites de stickers/audio-memes: o vivo (5242880 bytes) difere dos 512000 do arquivo,
--     mas audio-memes foi redefinido por 20261016001136 e stickers recebeu valor fora do
--     repo — decisao do dono, nao alterado aqui.
-- Sem reparo de dados. Idempotente: pode rodar duas vezes.
--
-- Rollback (SQL executavel, na ordem):
--   comment on function public.set_default_whatsapp_connection(uuid) is null;
--   drop policy if exists "Users can delete own team chat files" on storage.objects; create policy "Users can delete own team chat files" on storage.objects for delete to authenticated using (bucket_id = 'team-chat-files' and (storage.foldername(name))[1] in ((public.current_profile_id())::text, (auth.uid())::text));

comment on function public.set_default_whatsapp_connection(uuid) is
  'TRA-004 (item 174): troca atomica da conexao padrao do WhatsApp. Uma transacao '
  '(desmarca a anterior e marca o alvo), serializada por advisory lock, autorizada '
  'por is_admin_or_supervisor(auth.uid()) (mesma policy de UPDATE da tabela) e com '
  'resultado validado (exatamente uma padrao ao final). Retorna o uuid do alvo. '
  'Erro identico para id inexistente e chamador sem permissao.';

SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;

CREATE POLICY "Users can delete own team chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-chat-files'
    AND (storage.foldername(name))[1] = (public.current_profile_id())::text
  );
