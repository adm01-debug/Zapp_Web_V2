-- ============================================================================
-- REGISTRO DE MANUTENCAO PONTUAL - deliberadamente SEM DDL replicavel
-- ============================================================================
-- Version: 20260827130500  ·  name: vacuum_autovacuum_threshold_reset_m05
--
-- Este arquivo existe para restaurar a paridade entre supabase/migrations/ e
-- supabase_migrations.schema_migrations. O registro foi criado no banco em
-- 27/08/2026 sem arquivo correspondente no Git (mesmo padrao do achado A-05).
--
-- POR QUE ELE NAO REAPLICA O DDL ORIGINAL:
--
-- O `statements` gravado no banco continha:
--   ALTER TABLE public.login_attempts       SET (autovacuum_vacuum_threshold=0,
--                                                autovacuum_vacuum_scale_factor=0);
--   ALTER TABLE public.whatsapp_connections SET (... idem ...);
--   ALTER TABLE public.profiles             SET (... idem ...);
--   ALTER TABLE public.user_roles           SET (... idem ...);
--   ALTER TABLE public.contacts             SET (... idem ...);
--   SELECT cron.schedule('one-time-vacuum-bloated-tables', '* * * * *', ...VACUUM ANALYZE...);
--
-- Verificado no banco em 27/08/2026, depois da execucao:
--
--   1. NENHUMA das 5 tabelas tem reloptions. Confirmado por
--        SELECT relname, reloptions FROM pg_class c
--        JOIN pg_namespace n ON n.oid=c.relnamespace
--        WHERE n.nspname='public' AND reloptions IS NOT NULL;
--      -> retorna apenas as 7 views (security_invoker=true). Os SET foram
--         revertidos, como o proprio nome da migration ('..._reset_...') indica.
--
--   2. O job 'one-time-vacuum-bloated-tables' NAO existe mais em cron.job.
--      Restou 1 job apenas: cleanup-link-preview-cache (0 3 * * *).
--
--   3. Esse job rodou 2 vezes e FALHOU nas duas, em 18:03 e 18:04 de 27/08/2026
--      (cron.job_run_details, status='failed'). O agendamento era '* * * * *' -
--      a cada minuto - apesar do nome 'one-time'. Se nao tivesse sido removido,
--      estaria disparando VACUUM ANALYZE de minuto em minuto indefinidamente.
--
-- Reaplicar o DDL num `supabase db reset` seria ERRADO em dois pontos:
--   - reintroduziria autovacuum_vacuum_threshold=0 com scale_factor=0, o que faz
--     o autovacuum disparar a cada tupla morta (threshold = 0 + 0*reltuples = 0);
--   - recriaria o cron de minuto em minuto que ja se provou falho.
--
-- Se a limpeza de bloat precisar ser repetida, faca como operacao manual pontual
-- com VACUUM (ANALYZE) direto, nao como migration. Ver docs/MIGRATIONS.md.
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 20260827130500: registro de manutencao pontual, sem DDL. Ver comentario no arquivo.';
END
$$;
