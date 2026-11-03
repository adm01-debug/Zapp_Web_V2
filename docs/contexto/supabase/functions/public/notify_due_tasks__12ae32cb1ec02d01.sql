CREATE OR REPLACE FUNCTION public.notify_due_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
  v_task record;
BEGIN
  IF NOT public.is_privileged_contact_caller() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  FOR v_task IN
    SELECT t.id, t.title, t.created_by, t.contact_id, t.remind_at, p.user_id
    FROM public.conversation_tasks t
    JOIN public.profiles p ON p.id = t.created_by
    WHERE t.remind_at <= now() AND t.notified_at IS NULL AND t.status NOT IN ('done', 'cancelled')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (v_task.user_id, 'Lembrete: ' || v_task.title,
      CASE WHEN v_task.contact_id IS NOT NULL THEN 'Toque para abrir o contato.' ELSE 'Toque para abrir a tarefa.' END,
      'reminder_due', jsonb_build_object('task_id', v_task.id, 'contact_id', v_task.contact_id));
    UPDATE public.conversation_tasks SET notified_at = now() WHERE id = v_task.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$
