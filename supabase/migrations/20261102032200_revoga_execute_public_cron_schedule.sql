-- 20261102032200_revoga_execute_public_cron_schedule
-- Revoga EXECUTE de PUBLIC em cron.schedule/cron.unschedule.
--
-- Por que: ambas as funcoes sao criadas pela extensao pg_cron com ACL padrao concedendo EXECUTE a
-- PUBLIC (medido em 2026-11-02: pg_proc.proacl = '{=X/supabase_admin,supabase_admin=X/supabase_admin,
-- postgres=X*/supabase_admin}' -- a entrada '=X' sem role e PUBLIC, o que inclui authenticated e anon
-- por heranca). O app nunca chamou cron.schedule/unschedule do lado do cliente (grep em src/ e
-- supabase/functions/: zero ocorrencias fora de migrations). Nenhum exploit conhecido hoje -- o
-- schema cron nao e exposto pelo PostgREST (supabase/config.toml nao declara [api] schemas, o
-- default e public+graphql_public) -- mas reduz superficie de ataque desnecessaria: um bug futuro
-- que exponha RPC dinamico ou uma mudanca de config do PostgREST nao herdaria esse acesso de graca.
--
-- O dono das duas funcoes e supabase_admin; o papel usado pelo MCP oficial e pela maioria do apply
-- (`postgres`) tem EXECUTE WITH GRANT OPTION mas nao e dono nem superuser, e REVOKE so remove
-- privilegio concedido pelo proprio executor (ou por quem tem autoridade sobre ele). Por isso este
-- REVOKE roda como `supabase_admin` -- quem aplicar esta migration via `db_query` do MCP oficial
-- (que conecta como `postgres`) vai receber "WARNING: no privileges could be revoked" ou similar e
-- NAO vai remover o acesso de fato; precisa rodar com um papel que tenha autoridade (supabase_admin)
-- -- no SQL Editor do painel Supabase, que conecta com privilegio administrativo.
--
-- Nao remove o acesso de `postgres`, que continua podendo agendar/desagendar (e quem roda a
-- migration `20261102022200_cron_historico_retencao_7d`). Rollback:
--   GRANT EXECUTE ON FUNCTION cron.schedule(text,text), cron.schedule(text,text,text),
--                             cron.unschedule(bigint), cron.unschedule(text) TO PUBLIC;
--
-- O replay em Postgres descartavel (db-guard.yml) nao tem a extensao pg_cron: o bloco abaixo so
-- age quando ela existe, mesmo padrao de 20261102022200_cron_historico_retencao_7d.sql.
--
-- ACHADO DA REVISAO (Codex + Qodo, 2026-11-02): rodar isto como `postgres` sem autoridade sobre o
-- grant de `supabase_admin` faz o REVOKE virar WARNING silencioso, sem efeito -- e o fluxo de apply
-- registra a migration no ledger como se o endurecimento tivesse acontecido (seção 1 do CLAUDE.md:
-- DDL + INSERT no ledger na mesma transacao). Por isso o bloco confere a ACL de verdade depois do
-- REVOKE (aclexplode, grantee 0 = PUBLIC) e aborta com RAISE EXCEPTION se PUBLIC ainda tiver
-- EXECUTE em qualquer uma das 4 assinaturas -- a transacao desfaz tudo, o INSERT no ledger nunca
-- roda, e quem aplicou ve o erro e sabe que precisa de um papel com autoridade real (SQL Editor do
-- painel, como `postgres` nao e superuser nem dono).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION cron.schedule(text, text), cron.schedule(text, text, text), '
      || 'cron.unschedule(bigint), cron.unschedule(text) FROM PUBLIC';
    IF EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE n.nspname = 'cron' AND p.proname IN ('schedule', 'unschedule')
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'REVOKE nao teve efeito: PUBLIC ainda tem EXECUTE em cron.schedule/unschedule. '
        'Rode esta migration com um papel administrativo (SQL Editor do painel Supabase) -- postgres '
        'nao e superuser nem dono das funcoes e nao consegue revogar o grant de supabase_admin.';
    END IF;
  END IF;
END $$;
