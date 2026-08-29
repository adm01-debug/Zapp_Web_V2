-- 20260829090000_fix_clear_login_attempts_guard
-- Fix operador ->>> (invalido) em clear_login_attempts. Sessao paralela 29/08/2026.
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (coalesce(auth.role(), session_user) IN ('service_role', 'postgres', 'supabase_admin'))
     AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email', ''))
  THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;
