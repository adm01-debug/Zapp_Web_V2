CREATE OR REPLACE FUNCTION public.prevent_contact_assignee_hijack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := public.resolve_contact_guard_actor();
BEGIN
  IF v_user_id IS NOT NULL
     AND NEW.assigned_to IS NOT NULL
     AND NOT public.is_admin_or_supervisor(v_user_id)
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to
          AND p.is_active IS TRUE
          AND ur.role IN ('agent', 'supervisor', 'admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.assigned_to <> public.get_profile_id_for_user(v_user_id) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
