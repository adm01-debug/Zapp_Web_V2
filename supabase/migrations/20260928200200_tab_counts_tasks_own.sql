-- Contagem da aba Tarefas do chat passa a ser "minhas tarefas abertas" (status fora de done/cancelled).
-- reminders_pending devolve 0 (compat até a remoção do campo no front — etapa 147 do plano).

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
    (SELECT count(*)::integer FROM public.conversation_tasks AS task
     WHERE task.contact_id = p_contact_id
       AND task.created_by = public.get_profile_id_for_user(auth.uid())
       AND task.status NOT IN ('done','cancelled')),
    (SELECT count(*)::integer FROM public.contact_notes AS note WHERE note.contact_id = p_contact_id),
    (SELECT count(*)::integer FROM public.messages AS message
     WHERE message.contact_id = p_contact_id AND message.media_url IS NOT NULL),
    0::integer;
END;
$function$;
