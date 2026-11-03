CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.permissions IS DISTINCT FROM NEW.permissions) OR (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN
    IF current_setting('app.internal_role_sync', true) = 'true' THEN RETURN NEW; END IF;
    IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level'; END IF;
  END IF;
  IF (OLD.can_download IS DISTINCT FROM NEW.can_download) OR (OLD.max_chats IS DISTINCT FROM NEW.max_chats) OR (OLD.session_invalidated_at IS DISTINCT FROM NEW.session_invalidated_at) OR (OLD.department IS DISTINCT FROM NEW.department) OR (OLD.department_id IS DISTINCT FROM NEW.department_id) THEN
    IF current_setting('app.internal_role_sync', true) = 'true' THEN RETURN NEW; END IF;
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    IF NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id'; END IF;
  END IF;
  RETURN NEW;
END;
$function$
