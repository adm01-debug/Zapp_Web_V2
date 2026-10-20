-- 20260828220000_gmail_accounts_history_watch
--
-- BLOQUEANTE: gmail-sync e gmail-webhook faziam
--   .select("id, email_address, is_active, sync_status, token_expires_at, history_id, user_id")
-- e gravavam watch_expiration -- mas nenhuma das duas colunas existia na tabela.
-- O select falhava com 42703, account vinha null e TODA acao de sync morria em
-- "Gmail account not found or inactive" (visto na UI como "Edge Function returned
-- a non-2xx status code").
--
-- history_id      : ultimo historyId do Gmail, base do sync incremental
-- watch_expiration: expiracao do watch de push notifications (Gmail expira em 7d)

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS history_id text,
  ADD COLUMN IF NOT EXISTS watch_expiration timestamptz;
