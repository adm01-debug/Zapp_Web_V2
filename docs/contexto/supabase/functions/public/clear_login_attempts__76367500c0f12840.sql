CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Guard: service_role/postgres/supabase_admin podem limpar qualquer email.
  -- authenticated so pode limpar o proprio email (via compare case-insensitive).
  -- cron (session_user='postgres') cai no primeiro ramo e passa.
  -- CORRIGIDO: ->>> nao existe; operador correto e ->>'email' (double arrow).
  IF NOT (
       coalesce(auth.role(), session_user)
         IN ('service_role', 'postgres', 'supabase_admin')
  )
  AND NOT (
       auth.role() = 'authenticated'
       AND LOWER(auth.jwt()->>'email') = LOWER(p_email)
  )
  THEN
    RAISE EXCEPTION 'clear_login_attempts: operacao nao autorizada para role=% email=%',
      coalesce(auth.role(),'none'), p_email;
  END IF;

  DELETE FROM public.login_attempts
  WHERE email = LOWER(p_email);
END;
$function$
