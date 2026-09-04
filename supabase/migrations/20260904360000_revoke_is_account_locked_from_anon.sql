-- Revoga permissão de execução de is_account_locked para o role anon.
-- A verificação de bloqueio de conta agora ocorre exclusivamente via edge function
-- check-account-lock (verify_jwt=false), que roda com service_role.
-- Isso garante que o anon não possa chamar a função diretamente.

REVOKE EXECUTE ON FUNCTION public.is_account_locked(TEXT) FROM anon;
