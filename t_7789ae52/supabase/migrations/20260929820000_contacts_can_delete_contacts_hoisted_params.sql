-- 20260929820000 — can_delete_contacts deixa de pagar o lookup caro por linha.
--
-- Ultimo ponto de chamada que ainda usava can_edit_contact(uuid, uuid) (a versao de 2
-- argumentos, que resolve is_admin_or_supervisor/get_visible_agent_ids/get_profile_id_for_user
-- a cada linha). As policies de contacts, search_contacts, delete_contact e delete_contacts
-- ja recebem os lookups por parametro desde 20260929780000/20260929810000; aqui a mesma
-- correcao chega a funcao que alimenta o gate do item "Excluir" na UI (uma linha por contato
-- da pagina: a lista chama com poucas dezenas de ids, mas nao ha motivo para pagar por linha).
--
-- Os lookups passam a vir de subconsultas sem correlacao: o planejador as resolve uma unica
-- vez (InitPlan) e a funcao so testa pertinencia de array por linha.

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
$function$;

COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
  'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes ou ja excluidos nao retornam linha. Alimenta o gate do item "Excluir" na UI do modulo Contatos.';
