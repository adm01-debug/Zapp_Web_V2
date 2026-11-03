CREATE OR REPLACE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.is_admin_or_supervisor(auth.uid())
    OR p_assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR EXISTS (
         SELECT 1
         FROM public.queue_members qm
         WHERE qm.queue_id = p_queue_id
           AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
           AND qm.is_active = true
       )
$function$

COMMENT ON FUNCTION public.can_edit_contact(uuid, uuid) IS
  'Predicado unico de permissao do modulo Contatos (natureza: ver/editar/excluir). Fonte de verdade compartilhada pelas policies de public.contacts (SELECT e UPDATE), por search_contacts e pelas RPCs delete_contact/delete_contacts. Trocar a regra aqui muda as quatro de uma vez.'

CREATE OR REPLACE FUNCTION public.can_delete_contacts(p_ids uuid[])
 RETURNS TABLE(contact_id uuid, can_delete boolean)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, public.can_edit_contact(c.assigned_to, c.queue_id)
  FROM public.contacts c
  WHERE c.id = ANY(p_ids)
    AND c.deleted_at IS NULL
$function$

COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
  'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes ou ja excluidos nao retornam linha. Alimenta o gate do item "Excluir" na UI do modulo Contatos.'

REVOKE EXECUTE ON FUNCTION public.can_edit_contact(uuid, uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.can_edit_contact(uuid, uuid) TO authenticated, service_role

REVOKE EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) TO authenticated, service_role
