-- P0: REVOKE INSERT de anon em passkey_credentials
-- O item 4 da lista de anomalias nunca havia sido aplicado.
-- O role anon (usuário não autenticado) tinha GRANT INSERT direto na tabela
-- de credenciais passkey, independente de RLS. Brecha: anon pode inserir
-- passkeys mesmo sem estar autenticado se as políticas RLS tiverem gaps.
--
-- Rollback: GRANT INSERT ON public.passkey_credentials TO anon;

REVOKE INSERT ON public.passkey_credentials FROM anon;
