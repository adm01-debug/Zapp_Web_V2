-- gmail_accounts_sync_backoff
-- Rollback: dropa as duas colunas novas de public.gmail_accounts.
-- Rollback (SQL executável, na ordem):
--   alter table public.gmail_accounts drop column if exists next_attempt_at;
--   alter table public.gmail_accounts drop column if exists error_count;
--
-- Espera crescente das falhas transitorias de sincronizacao do Gmail.
-- `error_count` conta as falhas SEGUIDAS (reinicia em 0 quando a conta
-- sincroniza ou e reconectada) e `next_attempt_at` e quando o gmail-cron-sync
-- pode tentar a conta de novo. Contas com sync_status = 'reauth_required'
-- (token revogado) nao sao tentadas de novo — exigem reconectar.
--
-- Aditiva: so acrescenta colunas. Nao mexe em RLS nem cria GRANT — a ACL da
-- tabela ja cobre as colunas novas (authenticated nao ganha nada novo); o
-- teste scripts/db-audit/gmail-accounts-sync-backoff.test.sh prova isso.

SET search_path = public, pg_temp;

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gmail_accounts.error_count IS
  'Falhas seguidas de sincronizacao (espera crescente no gmail-cron-sync)';
COMMENT ON COLUMN public.gmail_accounts.next_attempt_at IS
  'Quando a conta pode ser tentada de novo pelo cron (NULL = ja pode)';
