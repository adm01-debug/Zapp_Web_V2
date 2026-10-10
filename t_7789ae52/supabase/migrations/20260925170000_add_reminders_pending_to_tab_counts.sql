-- Aba "Lembretes" do painel do chat não tem contador de pendentes: a RPC
-- get_conversation_tab_counts só resolvia tasks_open/notes_total/files_total.
-- Adiciona reminders_pending no mesmo padrão (contagem, SECURITY DEFINER,
-- checagem de visibilidade do contato já existente).

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
 RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer, reminders_pending integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'contact is not visible to current user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer
       FROM public.conversation_tasks AS task
      WHERE task.contact_id = p_contact_id
        AND coalesce(task.status, 'pending') <> 'completed'),
    (SELECT count(*)::integer
       FROM public.contact_notes AS note
      WHERE note.contact_id = p_contact_id),
    (SELECT count(*)::integer
       FROM public.messages AS message
      WHERE message.contact_id = p_contact_id
        AND message.media_url IS NOT NULL),
    (SELECT count(*)::integer
       FROM public.reminders AS reminder
      WHERE reminder.contact_id = p_contact_id
        AND reminder.is_dismissed = false);
END;
$function$;
