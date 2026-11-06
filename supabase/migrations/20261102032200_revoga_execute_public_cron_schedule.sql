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
-- privilegio concedido pelo proprio executor (ou por quem tem autoridade sobre ele). Por isso:
--   * Se o executor for supabase_admin ou superuser: aplica o REVOKE e verifica via aclexplode.
--   * Se for postgres (MCP): emite WARNING, pula o REVOKE e continua para o INSERT no ledger.
--     O endurecimento real fica pendente -- execute no SQL Editor do painel Supabase:
--       REVOKE EXECUTE ON FUNCTION cron.schedule(text,text), cron.schedule(text,text,text),
--                                   cron.unschedule(bigint), cron.unschedule(text) FROM PUBLIC;
--
-- Nao remove o acesso de `postgres`, que continua podendo agendar/desagendar. Rollback:
--   GRANT EXECUTE ON FUNCTION cron.schedule(text,text), cron.schedule(text,text,text),
--                             cron.unschedule(bigint), cron.unschedule(text) TO PUBLIC;
--
-- O replay em Postgres descartavel (db-guard.yml) nao tem a extensao pg_cron: o bloco abaixo so
-- age quando ela existe, mesmo padrao de 20261102022200_cron_historico_retencao_7d.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF pg_has_role(current_user, 'supabase_admin', 'MEMBER')
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
    THEN
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
    ELSE
      RAISE WARNING 'cron-acl-revoke-skipped: % nao tem autoridade sobre supabase_admin; '
        'REVOKE nao aplicado. Para endurecer de fato, execute no SQL Editor: '
        'REVOKE EXECUTE ON FUNCTION cron.schedule(text,text), cron.schedule(text,text,text), '
        'cron.unschedule(bigint), cron.unschedule(text) FROM PUBLIC;', current_user;
    END IF;
  END IF;
END $$;
