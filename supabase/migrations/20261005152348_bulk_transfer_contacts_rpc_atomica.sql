-- bulk_transfer_contacts_rpc_atomica
-- Rollback: executar integralmente o bloco SQL comentado abaixo, até -- End Rollback.
-- DROP FUNCTION IF EXISTS public.bulk_transfer_contacts(uuid[], uuid, uuid, text);
-- CREATE OR REPLACE FUNCTION public.log_assignment_change()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = 'public'
-- AS $$
-- BEGIN
--   IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
--     INSERT INTO public.conversation_events (
--       contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
--     ) VALUES (
--       NEW.id,
--       CASE
--         WHEN OLD.assigned_to IS NULL THEN 'assign'
--         WHEN NEW.assigned_to IS NULL THEN 'unassign'
--         ELSE 'transfer'
--       END,
--       OLD.assigned_to,
--       NEW.assigned_to,
--       COALESCE(NEW.assigned_to, OLD.assigned_to),
--       jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
--     );
--   END IF;
--
--   -- Log queue changes
--   IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
--     INSERT INTO public.conversation_events (
--       contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
--     ) VALUES (
--       NEW.id,
--       'queue_transfer',
--       OLD.queue_id,
--       NEW.queue_id,
--       NEW.assigned_to,
--       jsonb_build_object('agent', NEW.assigned_to)
--     );
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$;
-- End Rollback

-- O trigger continua sendo a fonte de auditoria para todo UPDATE comum. A RPC
-- abaixo grava o evento completo por conta própria e ativa esta guarda apenas na
-- transação corrente, evitando um segundo evento transfer/queue_transfer.
CREATE OR REPLACE FUNCTION public.log_assignment_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  IF current_setting('app.bulk_transfer_contacts', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assigned_to IS NULL THEN 'assign'
        WHEN NEW.assigned_to IS NULL THEN 'unassign'
        ELSE 'transfer'
      END,
      OLD.assigned_to,
      NEW.assigned_to,
      COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
    );
  END IF;

  -- Log queue changes
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      'queue_transfer',
      OLD.queue_id,
      NEW.queue_id,
      NEW.assigned_to,
      jsonb_build_object('agent', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.bulk_transfer_contacts(uuid[], uuid, uuid, text);

CREATE FUNCTION public.bulk_transfer_contacts(
  p_contact_ids uuid[],
  p_to_agent_id uuid DEFAULT NULL,
  p_to_queue_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_visible_agent_ids uuid[];
  v_is_admin boolean;
  v_checked integer := 0;
  v_previous_trigger_guard text;
  v_contact record;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = '42501';
  END IF;

  IF (p_to_agent_id IS NULL) = (p_to_queue_id IS NULL) THEN
    RAISE EXCEPTION 'Informe exatamente um destino: agente ou fila.'
      USING ERRCODE = '22023';
  END IF;

  IF p_contact_ids IS NULL
     OR cardinality(p_contact_ids) = 0
     OR array_position(p_contact_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Lista de contatos invalida ou vazia.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT contact_id ORDER BY contact_id)
    INTO v_ids
    FROM unnest(p_contact_ids) AS ids(contact_id);

  SELECT p.id
    INTO v_actor_profile_id
    FROM public.profiles p
   WHERE p.user_id = v_actor_user_id
   LIMIT 1;

  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do usuario autenticado nao encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_admin_or_supervisor(v_actor_user_id)
    INTO v_is_admin;

  SELECT array_agg(ids.agent_id)
    INTO v_visible_agent_ids
    FROM public.get_visible_agent_ids(v_actor_user_id) AS ids(agent_id);

  IF p_to_agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
     WHERE p.id = p_to_agent_id
       AND p.is_active IS TRUE
       AND ur.role IN ('agent', 'supervisor', 'admin')
  ) THEN
    RAISE EXCEPTION 'Agente de destino invalido ou inativo.' USING ERRCODE = '22023';
  END IF;

  IF p_to_queue_id IS NOT NULL
     AND NOT (
       v_is_admin
       OR EXISTS (
         SELECT 1
           FROM public.queues q
           JOIN public.queue_members qm ON qm.queue_id = q.id
          WHERE q.id = p_to_queue_id
            AND qm.profile_id = v_actor_profile_id
            AND qm.is_active IS TRUE
       )
     ) THEN
    RAISE EXCEPTION 'Fila de destino invalida ou sem permissao.' USING ERRCODE = '42501';
  END IF;

  -- Bloqueia e valida TODOS os contatos antes da primeira escrita. SECURITY
  -- DEFINER não usa a policy de UPDATE, portanto reaplicamos literalmente seu
  -- predicado can_edit_contact para cada estado anterior.
  FOR v_contact IN
    SELECT c.id, c.assigned_to, c.queue_id
      FROM public.contacts c
     WHERE c.id = ANY(v_ids)
     ORDER BY c.id
     FOR UPDATE
  LOOP
    v_checked := v_checked + 1;
    IF NOT public.can_edit_contact(
      v_contact.assigned_to,
      v_contact.queue_id,
      v_visible_agent_ids,
      v_actor_profile_id,
      v_is_admin
    ) THEN
      RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para transferir.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF v_checked <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para transferir.'
      USING ERRCODE = '42501';
  END IF;

  v_previous_trigger_guard := current_setting('app.bulk_transfer_contacts', true);
  PERFORM set_config('app.bulk_transfer_contacts', 'on', true);

  BEGIN
    FOR v_contact IN
      SELECT c.id, c.assigned_to, c.queue_id
        FROM public.contacts c
       WHERE c.id = ANY(v_ids)
       ORDER BY c.id
    LOOP
      UPDATE public.contacts c
         SET assigned_to = CASE
               WHEN p_to_agent_id IS NOT NULL THEN p_to_agent_id
               ELSE c.assigned_to
             END,
             queue_id = CASE
               WHEN p_to_queue_id IS NOT NULL THEN p_to_queue_id
               ELSE c.queue_id
             END
       WHERE c.id = v_contact.id;

      INSERT INTO public.conversation_events (
        contact_id,
        event_type,
        from_agent_id,
        from_queue_id,
        to_agent_id,
        to_queue_id,
        performed_by,
        metadata
      ) VALUES (
        v_contact.id,
        'transfer',
        v_contact.assigned_to,
        v_contact.queue_id,
        p_to_agent_id,
        p_to_queue_id,
        v_actor_profile_id,
        CASE
          WHEN NULLIF(btrim(p_note), '') IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('note', btrim(p_note))
        END
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.bulk_transfer_contacts',
      COALESCE(v_previous_trigger_guard, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.bulk_transfer_contacts',
    COALESCE(v_previous_trigger_guard, ''),
    true
  );

  RETURN cardinality(v_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text) IS
  'Transfere um ou vários contatos atomicamente. Exige auth.uid(), reaplica can_edit_contact por contato, valida agente/fila de destino, grava um único evento transfer com origem e ator reais e aborta o lote inteiro em qualquer erro.';
