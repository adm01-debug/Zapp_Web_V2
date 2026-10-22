-- Auditoria 2026-10-22 S12-PII: login_attempts armazena email+ip_address sem TTL (LGPD).
-- Cria índice para limpeza eficiente e job de expurgo diário (90 dias de retenção).

CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON public.login_attempts (created_at);

SELECT cron.schedule(
  'cleanup-login-attempts-pii',
  '30 2 * * *',
  $$
    DELETE FROM public.login_attempts
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);
