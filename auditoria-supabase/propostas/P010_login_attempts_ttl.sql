-- P010: TTL LGPD para login_attempts (dados de IP e user-agent)
-- Achado: S12-01 — tabela acumula IPs indefinidamente, sem limpeza automática
-- Evidência (2026-10-22): 18 registros, mais antigo=2026-08-28, zero job cron para a tabela
-- Status: migration 20261026110300_login_attempts_ttl_lgpd.sql em PR #2186

-- === APPLY ===

-- Índice para limpeza eficiente por data
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON public.login_attempts (created_at);

-- Job cron: deletar registros com mais de 90 dias (LGPD art. 46)
SELECT cron.schedule(
  'login-attempts-ttl-90d',
  '0 3 * * *',
  $$DELETE FROM public.login_attempts WHERE created_at < NOW() - INTERVAL '90 days'$$
);

-- === ROLLBACK (se necessário reverter) ===
-- SELECT cron.unschedule('login-attempts-ttl-90d');
-- DROP INDEX IF EXISTS idx_login_attempts_created_at;

-- === VERIFICAÇÃO ===
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'login-attempts-ttl-90d';
-- SELECT count(*) FROM public.login_attempts WHERE created_at < NOW() - INTERVAL '90 days';
