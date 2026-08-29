CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $body$
BEGIN
  IF NOT (coalesce(auth.role(), session_user) IN ('service_role', 'postgres', 'supabase_admin'))
    AND NOT (auth.role() = 'authenticated' AND auth.jwt()->>'email' = p_email)
  THEN
    RAISE EXCEPTION 'Unauthorized: cannot clear login attempts for %', p_email;
  END IF;
  DELETE FROM public.login_attempts
  WHERE email = lower(p_email)
    AND attempt_time < now() - interval '15 minutes';
END;
$body$;
