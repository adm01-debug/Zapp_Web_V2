CREATE OR REPLACE FUNCTION public.mark_first_response(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- autorizacao: mesmo predicado do contacts_select_policy (RLS nao se aplica
  -- dentro de SECURITY DEFINER, entao a checagem e explicita aqui)
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.queue_members qm
          WHERE qm.queue_id = c.queue_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'nao autorizado para o contato %', p_contact_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.register_first_response_internal(p_contact_id, now());
END;
$function$
