-- revoke_gmail_token_columns
-- Rollback: REVOKE ALL ON public.gmail_accounts FROM anon, authenticated; GRANT SELECT ON public.gmail_accounts TO anon, authenticated;
--
-- Racional (N-138): as colunas de token OAuth criptografado da tabela
-- public.gmail_accounts — access_token_encrypted e refresh_token_encrypted
-- (bytea, adicionadas em 20260411014322) — estavam legiveis por SELECT direto
-- para os papeis anon e authenticated. O grant de SELECT no nivel da TABELA
-- (privilegio default do schema public) cobre TODAS as colunas, e um REVOKE por
-- coluna NAO remove um grant de tabela (PG 17, REVOKE, Description: "if a role
-- has been granted privileges on a table, then revoking the same privileges
-- from individual columns will have no effect"). Por isso a unica correcao
-- eficaz e revogar o grant de TABELA e reconceder SELECT apenas nas colunas
-- nao-sensiveis.
--
-- Nenhum fluxo legitimo depende da leitura direta destas colunas: o front
-- consome somente a RPC public.get_own_gmail_accounts() (SECURITY DEFINER, lê
-- como o dono) e a view public.gmail_accounts_safe (security_invoker=on) expoe
-- apenas as 10 colunas nao-sensiveis. As Edges Gmail usam service_role.
--
-- A lista abaixo foi conferida contra information_schema.columns no banco
-- descartavel: public.gmail_accounts tem 14 colunas. As 12 nao-sensiveis vao no
-- GRANT; as duas criptografadas (access_token_encrypted, refresh_token_encrypted)
-- ficam de fora. As colunas legado access_token/refresh_token (TEXT) ja foram
-- removidas em 20260411110918, entao nao existem no schema vivo.
--
-- service_role e o dono (postgres) mantem acesso total (nao afetados por esta
-- revogacao).

REVOKE ALL ON public.gmail_accounts FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  email_address,
  is_active,
  sync_status,
  last_sync_at,
  last_error,
  token_expires_at,
  created_at,
  updated_at,
  history_id,
  watch_expiration
) ON public.gmail_accounts TO anon, authenticated;
