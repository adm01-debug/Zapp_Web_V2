-- B5 FIX: record_failed_login exposta a PUBLIC e anon (DoS / lockout de contas)
-- ACL antes: {=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Qualquer requisição não-autenticada pode chamar esta função SECURITY DEFINER para
-- registrar N falhas em qualquer e-mail e disparar lockout exponencial (DoS).
-- Fix: revogar EXECUTE de PUBLIC (=) e anon; manter apenas authenticated e service_role.

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon;
