-- Registrada no banco como versao 20260829020000 com nome
-- fix_reassign_absent_agents_last_seen_at (aplicada diretamente).
-- Este arquivo garante que um fresh `supabase db push` produz o mesmo
-- estado: profiles.last_seen_at nao existe — substituido por JOIN em
-- user_sessions com last_activity_at.
--
-- A versao 20260829020000 no repo (mcp_exec_functions_harden.sql) cobre o
-- hardening do mcp_exec; esta cobre a correcao de reassign_absent_agents.
-- Ambas sao idempotentes (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(
  inactive_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Guard: apenas admin/supervisor ou service_role (guard herdado do guard_secdef_batch)
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor';
  END IF;

  -- Agentes ausentes: sem sessao ativa com last_activity_at recente
  -- FIX: substituiu p.last_seen_at (coluna inexistente) por JOIN em user_sessions
  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM user_sessions us
        WHERE us.user_id = p.user_id
          AND us.is_active = true
          AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
      )
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_absent.agent_id
    LOOP
      -- Agente substituto: ativo com sessao recente
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true AND p.is_active = true AND p.id != v_absent.agent_id
        AND EXISTS (
          SELECT 1 FROM user_sessions us
          WHERE us.user_id = p.user_id
            AND us.is_active = true
            AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
        )
      ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;
