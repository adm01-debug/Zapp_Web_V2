CREATE OR REPLACE FUNCTION public.conversation_event_assign_performed_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Só age quando há sessão de usuario (authenticated) e o chamador nao e admin/supervisor.
  -- service_role, cron (postgres) e chamadas de sistema tem auth.uid() nulo: passam.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    IF NEW.performed_by IS NULL THEN
      NEW.performed_by := public.current_profile_id();
    ELSIF NEW.performed_by IS DISTINCT FROM public.current_profile_id() THEN
      RAISE EXCEPTION 'performed_by deve ser o usuario atual'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
