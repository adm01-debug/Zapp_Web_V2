-- Auditoria 2026-10-22 S12-PII: login_attempts armazena email+ip_address sem TTL (LGPD).
-- Cria índice para limpeza eficiente e job de expurgo diário (90 dias de retenção).

-- Índice em updated_at: record_failed_login atualiza updated_at=now() em cada chamada,
-- portanto updated_at é a coluna correta para medir atividade recente.
-- Usar created_at seria incorreto: linhas com tentativas recentes mas criadas há >90d
-- seriam deletadas, podendo apagar lockouts ativos.
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at
  ON public.login_attempts (updated_at);

SELECT cron.schedule(
  'cleanup-login-attempts-pii',
  '30 2 * * *',
  $$
    DELETE FROM public.login_attempts
    WHERE updated_at < NOW() - INTERVAL '90 days';
  $$
);
