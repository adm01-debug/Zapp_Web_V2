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
    -- (SEC-RLS-03) O predicado de alcance entra no WHERE: contato fora do alcance (ou inexistente,
    -- ou ja excluido) NAO retorna linha -- a existencia da linha deixa de ser a resposta do oraculo.
    -- O can_delete do SELECT ja e sempre true nas linhas que sobram (mesmo predicado).
    AND public.can_edit_contact(
          c.assigned_to,
          c.queue_id,
          (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
          (SELECT public.get_profile_id_for_user(auth.uid())),
          (SELECT public.is_admin_or_supervisor(auth.uid()))
        )
$function$
