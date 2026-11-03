CREATE OR REPLACE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[], p_profile_id uuid, p_is_admin boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- COALESCE no resultado: `x = ANY(NULL)` devolve NULL (o `x IN (SELECT ... vazio)` devolvia
  -- false), e o chamador tem que receber boolean limpo -- sem isto a UI trata "sem vinculo"
  -- como "sem resposta" e mantem o item "Excluir" visivel.
  SELECT COALESCE(
    COALESCE(p_is_admin, public.is_admin_or_supervisor(auth.uid()))
    OR p_assigned_to = ANY (COALESCE(p_visible_agent_ids, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v)))
    OR EXISTS (
         SELECT 1
         FROM public.queue_members qm
         WHERE qm.queue_id = p_queue_id
           AND qm.profile_id = COALESCE(p_profile_id, public.get_profile_id_for_user(auth.uid()))
           AND qm.is_active = true
       ),
    false)
$function$
