-- Guard intermediario de clear_login_attempts (versao 090000).
-- Superada por 100000 (fix_clear_login_operator_triple_arrow) que usa
-- logica NOT (authenticated AND LOWER(email) = LOWER(p_email)).
-- Em fresh db reset: 090000 aplica guarda valido, 100000 o refina.
-- Ver secao 9 em docs/DB-SECURITY.md para historico completo.

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
       coalesce(auth.role(), session_user)
         IN ('service_role', 'postgres', 'supabase_admin')
  )
  AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email', ''))
  THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;

  DELETE FROM public.login_attempts
  WHERE email = LOWER(p_email);
END;
$$;
