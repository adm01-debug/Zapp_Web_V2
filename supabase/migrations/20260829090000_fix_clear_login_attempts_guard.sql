-- 20260829090000_fix_clear_login_attempts_guard
-- Corrige 3 regressoes introduzidas pela migration 20260829080000 (sessao paralela):
--
-- 1. RUNTIME ERROR: DELETE usava 'attempt_time' que nao existe na tabela login_attempts.
--    A coluna correta e 'last_attempt_at', mas sem filtro temporal nao e necessaria.
--
-- 2. BYPASS NULL: guard 'AND NOT (auth.role()=authenticated AND jwt.email=p_email)'
--    com jwt.email=NULL resulta em 'AND NOT NULL' = NULL = FALSE -> nenhuma excecao.
--    Qualquer authenticated sem JWT bypassa completamente o guard.
--    Fix: IS DISTINCT FROM + coalesce e null-safe.
--
-- 3. CASE-SENSITIVE: 'jwt.email = p_email' rejeita proprio email em case diferente.
--    (ex: JWT='user@x.com', chamada='User@X.com' -> RAISE incorretamente).
--    Fix: LOWER() nos dois lados.
--
-- Mantido: session_user (correto para SECURITY DEFINER), ACL inalterada.

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- session_user: identidade real do chamador mesmo em SECURITY DEFINER.
  -- pg_cron (postgres, sem JWT): coalesce(NULL,'postgres')='postgres' -> permitido
  -- authenticated via PostgREST: auth.role()='authenticated' -> checa email
  -- authenticated direto sem JWT: coalesce(NULL,'authenticated') -> checa email
  -- IS DISTINCT FROM + LOWER + coalesce('','') -> null-safe e case-insensitive.
  IF NOT (coalesce(auth.role(), session_user) IN ('service_role', 'postgres', 'supabase_admin'))
     AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email', ''))
  THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;
