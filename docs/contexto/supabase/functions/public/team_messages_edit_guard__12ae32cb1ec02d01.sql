CREATE OR REPLACE FUNCTION public.team_messages_edit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.sender_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'only sender can edit message';
  END IF;
  IF OLD.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'edit window expired (48h)';
  END IF;
  NEW.is_edited := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
