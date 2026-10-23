-- PROPOSTA P010 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: public.login_attempts (retenção de PII — S12-PII)
-- Problema: A tabela login_attempts armazena email + ip_address sem TTL ou mecanismo de expiração
--   identificado via SQL. Retenção indefinida de PII é risco LGPD.
--
--   Evidência (S12-PII):
--     Colunas PII encontradas: login_attempts.email, login_attempts.ip_address
--     Sem coluna expires_at, deleted_at ou anonymized_at
--     Sem pg_cron job de limpeza identificado por nome
--
-- Impacto se não corrigido: Retenção indefinida de endereços IP e emails de tentativas de login.
--   Em auditoria LGPD, exige justificativa de necessidade ou implementação de TTL.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_login_attempts_created_at;
--   (o pg_cron job pode ser removido via SELECT cron.unschedule('cleanup-login-attempts-pii'))
--
-- ATENÇÃO: Confirmar nome da coluna de timestamp antes de aplicar:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'login_attempts' AND data_type ILIKE '%timestamp%';
--
-- DECISÃO DE NEGÓCIO NECESSÁRIA: Qual o período de retenção aceitável?
--   Sugestão: 90 dias (suficiente para investigação de incidentes, proporcional ao risco).

-- Passo 1: Criar índice para eficiência das limpezas periódicas
-- (ajustar nome da coluna de timestamp conforme schema real)
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON public.login_attempts (created_at);

-- Passo 2: Job de limpeza diária (remover registros com mais de 90 dias)
-- Verificar se já existe job similar antes de criar:
--   SELECT jobname FROM cron.job WHERE jobname ILIKE '%login%' OR jobname ILIKE '%attempt%';
SELECT cron.schedule(
  'cleanup-login-attempts-pii',
  '30 2 * * *',  -- diariamente às 02:30 (horário UTC)
  $$
    DELETE FROM public.login_attempts
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);

-- Passo 3 (opcional): Anonimizar registros entre 30-90 dias (preservar contagem mas remover PII)
-- UPDATE public.login_attempts
-- SET email = 'anonymized@deleted',
--     ip_address = '0.0.0.0'
-- WHERE created_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '30 days'
--   AND email != 'anonymized@deleted';
