-- B5 FIX COMPLEMENT: revoke anon execute on record_failed_login
-- Migration 000600 revoked PUBLIC but left the explicit anon grant intact.
-- Without this, unauthenticated clients can invoke record_failed_login via
-- PostgREST (anon role), enabling account-lockout DoS and user enumeration.
-- Expected ACL after: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ⚠️ REVERTIDO por 20260903210000: anon grant é NECESSÁRIO porque
-- src/lib/loginAttempts.ts chama record_failed_login via supabase.rpc() como
-- anon (pré-auth). Sem o grant o lockout nunca incrementa. Ver 20260903170000.

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon;
