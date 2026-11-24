-- Remove as 2 RPCs de limpeza de fixture de E2E. Nenhuma tem chamador desde que o
-- e2e-logado.yml passou a rodar num backend descartavel: o unico chamador era
-- scripts/ci/e2e-teardown.mjs, removido nesta mesma PR.
-- Ambas eram SECURITY DEFINER com EXECUTE para `authenticated` e `service_role`,
-- sem nenhum uso real: era superficie de escrita no banco de producao sem
-- contrapartida. Verificado antes do drop: 0 referencias em .github, src, e2e e
-- scripts (fora do teardown removido) e 0 linhas de fixture penduradas em
-- public.conversation_closures para o contato de teste.
--
-- Rollback: recriar a partir de
--   supabase/migrations/20261009142650_e2e_cleanup_conversation_closures_rpc.sql
--   supabase/migrations/20261015200000_e2e_cleanup_security_definer.sql

drop function if exists public.e2e_cleanup();
drop function if exists public.e2e_cleanup_conversation_closures();
