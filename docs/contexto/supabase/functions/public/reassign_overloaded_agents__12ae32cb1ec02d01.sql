CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Apenas admin/supervisor (ou service_role/cron). Agentes comuns bloqueados.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_overloaded_agents: requer perfil admin ou supervisor';
  END IF;
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats, COUNT(c.id) AS current_chats
    FROM profiles p JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true AND p.max_chats IS NOT NULL AND p.max_chats > 0
    GROUP BY p.id, p.max_chats HAVING COUNT(c.id) > p.max_chats
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true AND p.is_active = true AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) < p.max_chats)
      ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1;
      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_reassigned;
END;
$function$
