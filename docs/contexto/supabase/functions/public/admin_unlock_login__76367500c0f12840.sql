CREATE OR REPLACE FUNCTION public.admin_unlock_login(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_attempt_id uuid;
  v_attempts integer;
  v_locked_until timestamptz;
BEGIN
  IF NOT public.is_admin(v_actor) THEN RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501'; END IF;
  IF v_email IS NULL OR v_email = '' THEN RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.login_attempts WHERE email=v_email RETURNING id, attempt_count, locked_until INTO v_attempt_id, v_attempts, v_locked_until;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'login_unlock', 'login_attempts', v_attempt_id,
    jsonb_build_object('email_masked', CASE WHEN position('@' IN v_email)>0 THEN left(split_part(v_email,'@',1),1)||'***@'||split_part(v_email,'@',2) ELSE '***' END, 'attempts',v_attempts,'was_locked',(v_locked_until IS NOT NULL AND v_locked_until>now())));
END;
$function$
