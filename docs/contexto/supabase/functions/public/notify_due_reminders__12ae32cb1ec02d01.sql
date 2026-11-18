CREATE OR REPLACE FUNCTION public.notify_due_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH due AS MATERIALIZED (
    SELECT r.id AS reminder_id, r.title, r.description, r.contact_id, r.remind_at, p.user_id
    FROM public.reminders AS r
    JOIN public.profiles AS p ON p.id = r.profile_id
    WHERE r.remind_at <= now()
      AND r.is_dismissed = false
      AND r.notified_at IS NULL
      AND p.user_id IS NOT NULL
    FOR UPDATE OF r SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.notifications (id, user_id, type, title, message, metadata)
    SELECT
      md5('zapp:reminder-due:v1:' || due.reminder_id::text)::uuid,
      due.user_id,
      'reminder_due',
      'Lembrete: ' || due.title,
      COALESCE(due.description, 'Lembrete vencido em ' || to_char(due.remind_at, 'DD/MM HH24:MI')),
      jsonb_build_object(
        'reminder_id', due.reminder_id,
        'contact_id', due.contact_id,
        'remind_at', due.remind_at
      )
    FROM due
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  ),
  upd AS (
    UPDATE public.reminders AS r
    SET notified_at = now()
    FROM due
    WHERE r.id = due.reminder_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$function$
