CREATE OR REPLACE FUNCTION public.prevent_contact_queue_hijack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := public.resolve_contact_guard_actor();
BEGIN
  IF v_user_id IS NOT NULL
     AND NEW.queue_id IS NOT NULL
     AND NOT public.is_admin_or_supervisor(v_user_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = public.get_profile_id_for_user(v_user_id)
         AND qm.is_active IS TRUE
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
