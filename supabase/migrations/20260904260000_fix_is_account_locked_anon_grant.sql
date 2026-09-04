-- SECURITY SUPPLEMENT: corrigir grant residual descoberto por auditoria pós-aplicação
-- is_account_locked: REVOKE FROM PUBLIC (migration 240000) não cobriu grant direto ao anon
-- Callable por anon = clientes com anon key podem consultar se qualquer email está bloqueado
-- (account enumeration / info leakage via lockout oracle)
REVOKE EXECUTE ON FUNCTION public.is_account_locked(text) FROM anon;
