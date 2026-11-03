CREATE OR REPLACE FUNCTION public.expire_orphan_user_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marcadas integer;
BEGIN
  UPDATE public.user_sessions AS us
     SET is_active = false,
         ended_at = COALESCE(us.ended_at, now())
   WHERE us.is_active IS TRUE
     AND NOT EXISTS (
           SELECT 1
             FROM auth.sessions AS s
            WHERE s.id = us.auth_session_id
              AND s.user_id = us.user_id
              AND (s.not_after IS NULL OR s.not_after > now())
         );
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  RETURN v_marcadas;
END;
$function$
