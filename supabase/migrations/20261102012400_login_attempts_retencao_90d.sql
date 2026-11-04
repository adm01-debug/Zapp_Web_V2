-- S12-PII (auditoria 2026-10-22): public.login_attempts guarda email, ip_address e
-- user_agent sem prazo de expiracao (LGPD - retencao indefinida de dado pessoal).
--
-- A tabela tem UMA linha por email (login_attempts_email_key) e e atualizada a cada
-- tentativa; por isso a idade e medida pela ultima atividade, nao por created_at.
-- Bloqueio em vigor (locked_until no futuro) nunca e apagado.
--
-- Padrao dos demais jobs de retencao do projeto (reconnection-logs-retention-30d):
-- DELETE inline no pg_cron, horario 04:xx UTC.
--
-- Rollback: SELECT cron.unschedule('login-attempts-retention-90d');

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'login-attempts-retention-90d';

SELECT cron.schedule(
  'login-attempts-retention-90d',
  '41 4 * * *',
  $job$
    DELETE FROM public.login_attempts
     WHERE coalesce(last_attempt_at, updated_at, created_at) < now() - interval '90 days'
       AND (locked_until IS NULL OR locked_until < now())
  $job$
);
