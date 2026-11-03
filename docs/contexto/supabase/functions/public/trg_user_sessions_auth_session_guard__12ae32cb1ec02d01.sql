CREATE OR REPLACE FUNCTION public.trg_user_sessions_auth_session_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.auth_session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = NEW.auth_session_id AND s.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'auth_session_id nao pertence a este usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
