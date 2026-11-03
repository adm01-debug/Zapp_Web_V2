CREATE OR REPLACE FUNCTION public.can_delete_contacts(p_ids uuid[])
 RETURNS TABLE(contact_id uuid, can_delete boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id,
         public.can_edit_contact(
           c.assigned_to,
           c.queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))
         )
  FROM public.contacts c
  WHERE c.id = ANY(p_ids)
    AND c.deleted_at IS NULL
$function$

COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
  'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes ou ja excluidos nao retornam linha. Alimenta o gate do item "Excluir" na UI do modulo Contatos.'
