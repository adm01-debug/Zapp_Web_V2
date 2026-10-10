-- revoke_gmail_token_columns
-- Rollback:
--   REVOKE ALL ON public.gmail_accounts FROM anon, authenticated;
--   GRANT SELECT ON public.gmail_accounts TO anon, authenticated;
--
-- Racional: as colunas de token OAuth criptografado (access_token_encrypted,
-- refresh_token_encrypted) da tabela gmail_accounts estavam acessíveis por
-- SELECT para anon e authenticated via grant de tabela inteira. Mesmo
-- criptografadas, a existencia das colunas e a possibilidade de leitura
-- direta pelo navegador do proprietario da conta representam risco de
-- exposicao de segredos de longa duracao. A funcao get_own_gmail_accounts()
-- (SECURITY DEFINER) nao retorna essas colunas no seu contrato de retorno,
-- entao a revogacao nao quebra nenhum fluxo legítimo.
--
-- Fix: revogar todos os privilégios de anon/authenticated na tabela e
-- re-conceder SELECT apenas nas colunas nao-sensiveis (todas exceto
-- access_token_encrypted e refresh_token_encrypted). O service_role e o
-- postgres mantem acesso total (não afetado por esta revogacao). A view
-- gmail_accounts_safe e a funcao get_own_gmail_accounts continuam
-- operando normalmente pois nao referenciam estas colunas.

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