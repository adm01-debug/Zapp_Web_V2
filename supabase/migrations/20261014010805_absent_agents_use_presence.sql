-- absent_agents_use_presence
-- Rollback: volta reassign_absent_agents ao criterio anterior (ausencia por
-- Rollback: user_sessions.last_activity_at, default 30) e reafirma a ACL explicita.
-- Rollback (SQL executavel, na ordem):
--   create or replace function public.reassign_absent_agents(inactive_minutes integer DEFAULT 30) returns integer language plpgsql security definer set search_path to 'public' as $function$ DECLARE v_absent RECORD; v_new_agent UUID; v_reassigned INTEGER := 0; v_contact RECORD; BEGIN IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' AND NOT public.is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor'; END IF; FOR v_absent IN SELECT p.id AS agent_id FROM profiles p WHERE p.is_active = true AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id) AND NOT EXISTS (SELECT 1 FROM user_sessions us WHERE us.user_id = p.user_id AND us.is_active = true AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) LOOP FOR v_contact IN SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_absent.agent_id LOOP SELECT qm.profile_id INTO v_new_agent FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id) AND qm.is_active = true AND p.is_active = true AND p.id != v_absent.agent_id AND EXISTS (SELECT 1 FROM user_sessions us WHERE us.user_id = p.user_id AND us.is_active = true AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1; IF v_new_agent IS NOT NULL THEN UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id; INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata) VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent, jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes)); v_reassigned := v_reassigned + 1; END IF; END LOOP; END LOOP; RETURN v_reassigned; END; $function$;
--   revoke all on function public.reassign_absent_agents(integer) from public, anon;
--   grant execute on function public.reassign_absent_agents(integer) to authenticated, service_role;

-- ============================================================================
-- reassign_absent_agents deixa de usar user_sessions.last_activity_at (proxy que
-- quase nunca e atualizado -- so a Edge detect-new-device / useDeviceDetection
-- gravam, e apenas quando telas de Seguranca montam) e passa a usar a presenca
-- REAL em public.agent_presence, alimentada por heartbeat de ~25s
-- (src/hooks/crm/useAgentPresence.ts).
--
-- Regra de ausencia: o agente esta AUSENTE quando NAO existe linha em
-- agent_presence para o user_id dele com heartbeat fresco
-- (updated_at > now() - inactive_minutes) E status <> 'offline'. "fresco" prova
-- que a aba/agente continua vivo; 'offline' e o pedido explicito de ficar
-- oculto, entao mesmo com heartbeat conta como ausente (cartao: "sem heartbeat
-- fresco e nao online").
--
-- inactive_minutes passa a governar a janela do heartbeat (segundos na pratica:
-- o TTL do servidor expira presenca em 90s, migration 20260925100542) e o default
-- cai de 30 para 2. O chamador do front (useAgentReassignment.ts) passa o valor
-- explicitamente; ajustar o default dele e de outro cartao (front).
--
-- O SUBSTITUTO tambem passa a ser escolhido por heartbeat fresco -- se so o
-- criterio do ausente mudasse, user_sessions nunca teria sessao recente e a fila
-- quase nunca acharia substituto.
--
-- Mantidos intactos: guard de papel (admin/supervisor ou service_role), o
-- SECURITY DEFINER + search_path, o registro em conversation_events
-- ('absence_reassign') e as travas contra sequestro de contato -- o UPDATE em
-- contacts segue disparando trg_prevent_contact_assignee_hijack
-- (migration 20260924203300), que libera a operacao quando quem chama e
-- admin/supervisor (authenticated) ou service_role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(
  inactive_minutes integer DEFAULT 2
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_absent     RECORD;
  v_new_agent  UUID;
  v_reassigned INTEGER := 0;
  v_contact    RECORD;
BEGIN
  -- Guard de papel herdado (guard_secdef_batch).
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor';
  END IF;

  -- Entrada invalida falha cedo, antes de qualquer movimento.
  IF inactive_minutes IS NULL OR inactive_minutes < 0 THEN
    RAISE EXCEPTION 'reassign_absent_agents: inactive_minutes invalido (%)', inactive_minutes
      USING ERRCODE = '22023';
  END IF;

  -- Ausente = sem heartbeat fresco em agent_presence (e nao explicitamente offline).
  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
      AND NOT EXISTS (
        SELECT 1
        FROM agent_presence ap
        WHERE ap.user_id = p.user_id
          AND ap.status <> 'offline'
          AND ap.updated_at > now() - (inactive_minutes || ' minutes')::interval
      )
    ORDER BY p.id
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_absent.agent_id
    LOOP
      -- Substituto: colega ativo de fila com heartbeat fresco (a fonte mudou).
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id <> v_absent.agent_id
        AND EXISTS (
          SELECT 1
          FROM agent_presence ap
          WHERE ap.user_id = p.user_id
            AND ap.status <> 'offline'
            AND ap.updated_at > now() - (inactive_minutes || ' minutes')::interval
        )
      ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC,
               qm.profile_id ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE public.contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
        INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- ACL explicita (a assinatura nao muda: CREATE OR REPLACE preserva a ACL, mas o
-- cartao exige grants declarados). Negar por padrao e liberar os papeis reais.
REVOKE ALL ON FUNCTION public.reassign_absent_agents(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_absent_agents(integer) TO authenticated, service_role;
