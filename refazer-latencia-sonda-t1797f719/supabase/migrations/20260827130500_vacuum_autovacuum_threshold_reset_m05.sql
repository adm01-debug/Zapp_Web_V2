-- Fix M-05: bloat alto em login_attempts (75%), profiles (67%), whatsapp_connections (67%).
-- VACUUM não roda dentro de transação PostgREST.
-- Workaround aplicado em sessão de manutenção:
--   1. ALTER TABLE ... SET (autovacuum_vacuum_threshold=0, autovacuum_vacuum_scale_factor=0)
--   2. cron.schedule('one-time-vacuum-bloated-tables', '* * * * *', 'VACUUM ANALYZE ...')
--   3. Aguardado 1 ciclo (60s); VACUUM executado via pg_cron worker (fora de transação)
--   4. cron.unschedule + ALTER TABLE RESET após confirmação n_dead_tup=0
--
-- Estado verificado pós-execução:
--   login_attempts:       n_dead_tup=0, last_autovacuum=2026-08-27T18:03:08
--   whatsapp_connections: n_dead_tup=0, last_autovacuum=2026-08-27T18:03:08
--   profiles:             n_dead_tup=0, last_autovacuum=2026-08-27T18:03:08
--   user_roles:           n_dead_tup=0, last_autovacuum=2026-08-27T18:03:08
--   contacts:             n_dead_tup=0, last_autovacuum=2026-08-27T18:03:08
--
-- Restaurando defaults (idempotente):
ALTER TABLE public.login_attempts       RESET (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
ALTER TABLE public.whatsapp_connections  RESET (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
ALTER TABLE public.profiles              RESET (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
ALTER TABLE public.user_roles            RESET (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
ALTER TABLE public.contacts              RESET (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor);
