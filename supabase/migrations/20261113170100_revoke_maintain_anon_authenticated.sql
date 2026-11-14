-- 20261113170100_revoke_maintain_anon_authenticated
--
-- PRECISA DE APROVAÇÃO DO DONO ANTES DE APLICAR EM PRODUÇÃO (DDL de permissão).
--
-- Sintoma (inventário de banco, 13/11/2026, MCP read-only, PostgreSQL 17.6):
--   has_table_privilege('anon', oid, 'MAINTAIN')          → 104 relações de
--     `public` (96 tabelas + 8 views), p.ex. `away_messages` com relacl
--     `anon=m/postgres` — anon NÃO tem SELECT nela, só MAINTAIN;
--   has_table_privilege('authenticated', oid, 'MAINTAIN') → 167 relações
--     (154 tabelas + 13 views), p.ex. `profiles`, `away_messages`
--     (`authenticated=arwdm/postgres`).
-- Causa: `GRANT ALL` histórico. No PG 17 `ALL` passou a incluir o privilégio
-- novo MAINTAIN (VACUUM, ANALYZE, REINDEX, REFRESH MATERIALIZED VIEW, CLUSTER,
-- LOCK TABLE), e o default privilege do dono `postgres` em `public` ainda o
-- concede a toda tabela nova: pg_default_acl → `authenticated=arwdm/postgres`.
-- Papéis da API REST não têm por que manter tabelas; é privilégio fora do
-- desenho (sem exploração conhecida via PostgREST, mas `LOCK TABLE` por SQL
-- direto seria negação de serviço).
--
-- Correção (idempotente — REVOKE do que já não existe é no-op):
--   1) tira MAINTAIN de anon e authenticated em todas as relações de `public`
--      (ALL TABLES cobre tabelas, views e foreign tables);
--   2) tira MAINTAIN do default privilege do dono `postgres`, para tabelas
--      futuras não voltarem a nascer com ele.
-- Fora do alcance desta migration (conecta como `postgres`, não superuser):
-- o default privilege de `supabase_admin` em `public` (`anon/authenticated=
-- arwdDxtm/supabase_admin`) só pelo SQL Editor do dashboard, se um dia uma
-- tabela for criada por esse papel (hoje todas as 224 relações de `public`
-- são de `postgres`).
--
-- Reversão (mais ampla que o original — o original era por relação):
--   GRANT MAINTAIN ON ALL TABLES IN SCHEMA public TO authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT MAINTAIN ON TABLES TO authenticated;
--   (anon nunca teve MAINTAIN por desenho; não há o que devolver)

-- REVOKE em ~224 relações pega AccessExclusiveLock curto em cada uma: não
-- esperar atrás de consulta longa segurando todo mundo.
SET LOCAL lock_timeout = '3s';

REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE MAINTAIN ON TABLES FROM anon, authenticated;
