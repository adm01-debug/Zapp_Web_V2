CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::integer FROM public.conversation_tasks t
      WHERE t.contact_id = p_contact_id
        AND COALESCE(t.status, 'pending') <> 'completed') AS tasks_open,
    (SELECT COUNT(*)::integer FROM public.contact_notes n
      WHERE n.contact_id = p_contact_id) AS notes_total,
    (SELECT COUNT(*)::integer FROM public.messages m
      WHERE m.contact_id = p_contact_id
        AND m.media_url IS NOT NULL) AS files_total
$$
