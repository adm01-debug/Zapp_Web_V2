-- 20260827180000_guard_clear_login_attempts
--
-- CONTEXTO (auditoria 27/08/2026):
-- clear_login_attempts era SECURITY DEFINER com ACL
-- {postgres=X, authenticated=X, service_role=X} e corpo sem qualquer guard:
--   DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
-- Ou seja: qualquer usuario logado podia zerar o lockout de forca bruta de
-- QUALQUER email (facilitando ataque de credential stuffing contra terceiros).
--
-- POR QUE NAO REVOKE FROM authenticated:
-- o cliente chama legitimamente em src/lib/loginAttempts.ts:66
-- (supabase.rpc('clear_login_attempts', { p_email })) apos signIn bem-sucedido,
-- com JWT authenticated. A migration 20260827130600 ja revogou PUBLIC/anon de
-- proposito e manteve authenticated — o que faltava era o guard DENTRO da funcao.
--
-- FIX: service_role (backend/cron) pode limpar qualquer email; authenticated
-- so o proprio email do JWT (case-insensitive). auth.role() cobre tanto
-- request.jwt.claim.role (legacy) quanto request.jwt.claims->>'role'.

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- service_role (backend) pode limpar qualquer email; authenticated so o proprio.
  -- auth.role() cobre request.jwt.claim.role (legacy) e request.jwt.claims->>'role'.
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email','')) THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;
