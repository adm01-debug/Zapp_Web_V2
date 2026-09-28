-- Aviso de alarme de tarefa (substitui notify_due_reminders + cron 'notify-due-reminders', que só existia
-- no banco e não no repo). Plano docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md, etapas 17-18.

CREATE OR REPLACE FUNCTION public.notify_due_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH due AS MATERIALIZED (
    SELECT t.id AS task_id, t.title, t.description, t.contact_id, t.remind_at, p.user_id
    FROM public.conversation_tasks AS t
    JOIN public.profiles AS p ON p.id = t.created_by
    WHERE t.remind_at <= now()
      AND t.notified_at IS NULL
      AND t.status NOT IN ('done','cancelled')
      AND p.user_id IS NOT NULL
    FOR UPDATE OF t SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.notifications (id, user_id, type, title, message, metadata)
    SELECT
      md5('zapp:task-due:v1:' || due.task_id::text || ':' || to_char(due.remind_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS'))::uuid,
      due.user_id,
      'reminder_due',
      'Lembrete: ' || due.title,
      COALESCE(due.description, 'Alarme marcado para ' || to_char(due.remind_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
      jsonb_build_object('task_id', due.task_id, 'contact_id', due.contact_id, 'remind_at', due.remind_at)
    FROM due
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  ),
  upd AS (
    UPDATE public.conversation_tasks AS t
    SET notified_at = now()
    FROM due
    WHERE t.id = due.task_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_due_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_due_tasks() TO postgres, service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-due-reminders') THEN
    PERFORM cron.unschedule('notify-due-reminders');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tasks-notify-due') THEN
    PERFORM cron.schedule('tasks-notify-due', '* * * * *', 'SELECT public.notify_due_tasks();');
  END IF;
END
$do$;

-- ROLLBACK (manual): SELECT cron.unschedule('tasks-notify-due');
--   SELECT cron.schedule('notify-due-reminders','* * * * *','SELECT public.notify_due_reminders();');
--   DROP FUNCTION public.notify_due_tasks();
