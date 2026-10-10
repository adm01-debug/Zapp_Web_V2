-- 20260829100000_fix_clear_login_operator_triple_arrow
-- clear_login_attempts usava ->>> (operador inexistente em PostgreSQL).
-- Auditoria exaustiva 29/08/2026 detectou via teste comportamental.
-- Fix: operador correto eh ->> para extrair campo JSON como text (double arrow).
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
       coalesce(auth.role(), session_user) IN ('service_role', 'postgres', 'supabase_admin')
  )
  AND NOT (
       auth.role() = 'authenticated'
       AND LOWER(auth.jwt()->>'email') = LOWER(p_email)
  )
  THEN
    RAISE EXCEPTION 'clear_login_attempts: operacao nao autorizada para role=% email=%',
      coalesce(auth.role(),'none'), p_email;
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;
