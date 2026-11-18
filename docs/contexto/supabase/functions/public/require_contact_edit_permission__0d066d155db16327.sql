CREATE OR REPLACE FUNCTION public.require_contact_edit_permission(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assigned_to uuid;
  v_queue_id    uuid;
  v_profile_id  uuid;
  v_is_admin    boolean;
  v_visible     uuid[];
  v_encontrado  boolean;
BEGIN
  IF public.is_privileged_contact_caller() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id
  FROM public.contacts
  WHERE id = p_contact_id;
  v_encontrado := FOUND;

  v_profile_id := public.get_profile_id_for_user(auth.uid());
  v_is_admin   := public.is_admin_or_supervisor(auth.uid());

  SELECT array_agg(ids.agent_id) INTO v_visible
  FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);

  -- (SEC-RLS-02) UM UNICO ponto de recusa: "uuid inexistente" (v_encontrado = false) e "uuid
  -- existente fora do alcance" levantam a MESMA excecao -- mesmo texto, mesmo SQLSTATE (42501) e
  -- mesmo ponto do codigo (o contexto do erro nao distingue os dois casos) -- e o id nao e ecoado.
  IF NOT (v_encontrado
          AND (v_is_admin
               OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin))) THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;
END;
$function$
