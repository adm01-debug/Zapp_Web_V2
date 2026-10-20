-- migration: tasks_notify_due_cron
-- Cria função notify_due_tasks() e agenda cron.
-- O cron notify-due-reminders (jobid=14) é DESLIGADO aqui (gap D1/D6: nome real diferente do plano).
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_due_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_task  record;
BEGIN
  FOR v_task IN
    SELECT t.id, t.title, t.created_by, t.contact_id, t.remind_at, p.user_id
    FROM public.conversation_tasks t
    JOIN public.profiles p ON p.id = t.created_by
    WHERE t.remind_at <= now()
      AND t.notified_at IS NULL
      AND t.status NOT IN ('done', 'cancelled')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (
      v_task.user_id,
      'Lembrete: ' || v_task.title,
      CASE WHEN v_task.contact_id IS NOT NULL
        THEN 'Toque para abrir o contato.'
        ELSE 'Toque para abrir a tarefa.'
      END,
      'reminder_due',
      jsonb_build_object(
        'task_id',    v_task.id,
        'contact_id', v_task.contact_id
      )
    );
    UPDATE public.conversation_tasks
    SET notified_at = now()
    WHERE id = v_task.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_due_tasks() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.notify_due_tasks() TO service_role;

-- Agendar novo cron (idempotente)
SELECT cron.unschedule('tasks-notify-due') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'tasks-notify-due'
);
SELECT cron.schedule('tasks-notify-due', '* * * * *', 'SELECT public.notify_due_tasks()');

-- Desligar cron de reminders (gap D1: nome real é 'notify-due-reminders', não 'reminders-notify-due')
SELECT cron.unschedule('notify-due-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'notify-due-reminders'
);

COMMIT;

-- ROLLBACK:
-- SELECT cron.unschedule('tasks-notify-due');
-- SELECT cron.schedule('notify-due-reminders','* * * * *','SELECT public.notify_due_reminders()');
-- DROP FUNCTION IF EXISTS public.notify_due_tasks();
