-- reaplica_gamification_revoke_rpcs
--
-- POR QUE EXISTE: o ledger (supabase_migrations.schema_migrations) registrou a versao
-- 20261012233536 (gamification_revoke_client_rpcs) com statements NULL, e o estado vivo
-- de producao NAO bate com o arquivo: o REVOKE nunca rodou. Prova (SELECT em producao,
-- 14/11/2026, PostgreSQL 17.6):
--   select p.oid::regprocedure, p.proacl, has_function_privilege('authenticated', p.oid, 'EXECUTE')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('add_agent_xp','grant_agent_achievement',
--          'increment_agent_messages','update_agent_streak');
--   -> as 4 linhas: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--      e has_function_privilege(authenticated) = true
--   select version, statements is null from supabase_migrations.schema_migrations
--    where version = '20261012233536';  -> 20261012233536 | true
-- Impacto: qualquer agente logado chama as RPCs SECURITY DEFINER pelo navegador e infla o
-- proprio XP, nivel, conquistas e contadores (ranking forjavel).
--
-- O QUE FAZ: reaplica, byte-identico, o corpo da 20261012233536 -- tira o EXECUTE de
-- PUBLIC/anon/authenticated nas 4 RPCs e mantem service_role. Nada mais muda: corpo de
-- funcao, SECURITY DEFINER, search_path, owner, tabela, policy e gatilho ficam como estao.
-- As redefinicoes posteriores de update_agent_streak (20261013044500 e 20261107153000) usam
-- CREATE OR REPLACE, que preserva a ACL, entao nao conflitam com este REVOKE.
--
-- QUEM CONTINUA FUNCIONANDO (conferido antes de revogar):
--   * front (src/) e edges (supabase/functions/) nao chamam nenhuma das 4 RPCs
--     (git grep; o contrato src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts
--     ja proibe a chamada no cliente);
--   * unico chamador no banco: handle_conversation_closure_gamification() (gatilho
--     trg_gamification_on_closure em conversation_closures), SECURITY DEFINER com owner
--     postgres -- roda como postgres, que mantem EXECUTE (postgres=X na proacl);
--   * nenhum job do pg_cron cita as 4 RPCs.
--
-- Idempotente: REVOKE de privilegio ausente e GRANT de privilegio existente sao no-op.
--
-- Rollback (SQL executavel, na ordem) -- devolve o estado vivo de antes desta migration:
--   grant execute on function public.add_agent_xp(uuid, integer) to authenticated, service_role;
--   grant execute on function public.grant_agent_achievement(uuid, text, text, text, integer) to authenticated, service_role;
--   grant execute on function public.increment_agent_messages(uuid, text) to authenticated, service_role;
--   grant execute on function public.update_agent_streak(uuid, boolean) to authenticated, service_role;

SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- Explicitos: service_role continua alcancando as 4; nenhum outro papel de cliente.
GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  TO service_role;
