CREATE OR REPLACE FUNCTION public.delete_contact(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_id uuid; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = p_id
     AND c.deleted_at IS NULL
     AND (
       -- Mesmo predicado de "Users can update their assigned contacts" (public.contacts).
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
       OR EXISTS (
            SELECT 1
              FROM public.queue_members qm
             WHERE qm.queue_id = c.queue_id
               AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
               AND qm.is_active = true
          )
     )
  RETURNING c.id INTO v_id;

  -- Sem linha: contato inexistente, ja excluido ou fora do alcance do chamador. Uma unica
  -- mensagem para os tres casos evita enumeracao de contatos por quem nao pode ver.
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para excluir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.delete_contacts(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_count integer; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = ANY(p_ids)
     AND c.deleted_at IS NULL
     AND (
       -- Mesmo predicado de "Users can update their assigned contacts" (public.contacts).
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
       OR EXISTS (
            SELECT 1
              FROM public.queue_members qm
             WHERE qm.queue_id = c.queue_id
               AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
               AND qm.is_active = true
          )
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum contato excluido: sem permissao ou ja excluido.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_count;
END;
$function$
