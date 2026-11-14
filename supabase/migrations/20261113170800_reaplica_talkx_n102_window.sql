-- Talk X (N-102, fatia "acesso"): reaplica o ACL de public.talkx_campaign_window_open que a
-- migration 20261013085500_talkx_n102_window_fixes.sql deveria ter deixado em produção.
--
-- Rollback: DO $$ BEGIN IF to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)') IS NULL THEN RAISE NOTICE 'reaplica_talkx_n102 rollback: funcao ausente, nada a restaurar'; RETURN; END IF; REVOKE EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) FROM service_role; GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz) TO authenticated; END; $$;
-- (o rollback devolve o ACL vivo de 14/11/2026: {postgres=X, authenticated=X, service_role=X})
--
-- Por que existe: o ledger (supabase_migrations.schema_migrations) registrou 20261013085500 com
-- statements NULL e o estado vivo não bate com o arquivo. Prova (SELECT no projeto oficial,
-- 14/11/2026):
--   SELECT version, statements IS NULL FROM supabase_migrations.schema_migrations
--    WHERE version = '20261013085500';
--     -> 20261013085500 | true
--   SELECT proacl, has_function_privilege('authenticated', oid, 'EXECUTE')
--     FROM pg_proc WHERE oid = 'public.talkx_campaign_window_open(uuid,timestamptz)'::regprocedure;
--     -> {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | true
-- O arquivo 20261013085500 tira o EXECUTE de authenticated e o deixa só em service_role; em
-- produção authenticated ainda executa.
--
-- O que NÃO falta (conferido no vivo, nada a reaplicar):
--   - Corpo da função: md5(prosrc) = a0a47dbe24f90f5903818d34b5f98d2a, idêntico ao corpo de
--     20261011000003_20261010_talkx_campaigns_dnd_weekdays.sql (N-118). Esse corpo já avalia
--     dia/hora/feriado no schedule_timezone da campanha (p_at AT TIME ZONE v_tz) e já exige
--     auth.role() = 'authenticated' + is_admin_or_supervisor(auth.uid()).
--   - 20261011003008_talkx_n102c_window_open.sql (versão RETURNS boolean) é arquivo superado:
--     não aplica sobre a N-118 ("cannot change return type of existing function"), registrado em
--     scripts/db-audit/replay-known-failures.json. Por isso esta migration NÃO recria o corpo.
--   - Nenhuma migration posterior a 20261013085500 (main e PRs abertas em 14/11/2026) toca
--     talkx_campaign_window_open.
--
-- O que esta migration faz: exatamente o DO de 20261013085500 (byte-idêntico) — REVOKE ALL de
-- PUBLIC/anon/authenticated e GRANT EXECUTE a service_role. Idempotente (REVOKE/GRANT repetidos
-- são no-op). Não muda SECURITY DEFINER, search_path, dono nem corpo. Sem chamador afetado: o
-- front (src/) não chama a RPC (só aparece em src/integrations/supabase/types.ts), nenhuma função
-- SQL nem job do pg_cron a referencia (SELECT em pg_proc.prosrc e cron.job: 0 linhas); o único
-- chamador é a edge talkx-scheduler, que usa service_role.
--
-- Sem BEGIN/COMMIT (o ledger aplica cada migration em transação própria). Sem lock em tabela.

DO $$
BEGIN
  IF to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)') IS NULL THEN
    RAISE NOTICE 'talkx_n102: base 20261009203548 ausente nesta pilha; nada a revogar (a funcao nao existe)';
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
    TO service_role;
END;
$$;
