-- reassign_agents_only_open_conversations
-- Rollback: volta as duas RPCs para as definicoes vigentes anteriores (sem filtro de abertas e sem p_dry_run).
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.reassign_overloaded_agents(boolean);
--   drop function if exists public.reassign_absent_agents(integer, boolean);
--   create or replace function public.reassign_overloaded_agents() returns integer language plpgsql security definer set search_path to 'public' as $function$ DECLARE v_overloaded RECORD; v_new_agent UUID; v_reassigned INTEGER := 0; v_contact RECORD; BEGIN IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' AND NOT public.is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'reassign_overloaded_agents: requer perfil admin ou supervisor'; END IF; FOR v_overloaded IN SELECT p.id AS agent_id, p.max_chats, COUNT(c.id) AS current_chats FROM profiles p JOIN contacts c ON c.assigned_to = p.id WHERE p.is_active = true AND p.max_chats IS NOT NULL AND p.max_chats > 0 GROUP BY p.id, p.max_chats HAVING COUNT(c.id) > p.max_chats LOOP FOR v_contact IN SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_overloaded.agent_id ORDER BY c.updated_at ASC LIMIT (v_overloaded.current_chats - v_overloaded.max_chats) LOOP SELECT qm.profile_id INTO v_new_agent FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id) AND qm.is_active = true AND p.is_active = true AND p.id != v_overloaded.agent_id AND (p.max_chats IS NULL OR (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) < p.max_chats) ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1; IF v_new_agent IS NOT NULL THEN UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id; INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata) VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent, jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats)); v_reassigned := v_reassigned + 1; END IF; END LOOP; END LOOP; RETURN v_reassigned; END; $function$;
--   create or replace function public.reassign_absent_agents(inactive_minutes integer DEFAULT 30) returns integer language plpgsql security definer set search_path to 'public' as $function$ DECLARE v_absent RECORD; v_new_agent UUID; v_reassigned INTEGER := 0; v_contact RECORD; BEGIN IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' AND NOT public.is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor'; END IF; FOR v_absent IN SELECT p.id AS agent_id FROM profiles p WHERE p.is_active = true AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id) AND NOT EXISTS (SELECT 1 FROM user_sessions us WHERE us.user_id = p.user_id AND us.is_active = true AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) LOOP FOR v_contact IN SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_absent.agent_id LOOP SELECT qm.profile_id INTO v_new_agent FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id) AND qm.is_active = true AND p.is_active = true AND p.id != v_absent.agent_id AND EXISTS (SELECT 1 FROM user_sessions us WHERE us.user_id = p.user_id AND us.is_active = true AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1; IF v_new_agent IS NOT NULL THEN UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id; INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata) VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent, jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes)); v_reassigned := v_reassigned + 1; END IF; END LOOP; END LOOP; RETURN v_reassigned; END; $function$;
--   revoke all on function public.reassign_overloaded_agents() from public, anon; revoke all on function public.reassign_absent_agents(integer) from public, anon; grant execute on function public.reassign_overloaded_agents() to authenticated, service_role; grant execute on function public.reassign_absent_agents(integer) to authenticated, service_role;

-- ============================================================================
-- reassign_overloaded_agents / reassign_absent_agents
--
-- Defeitos corrigidos (R2-AUTH-020 e o mesmo no de ausencia):
--   1. "chat ativo" e o episodio ABERTO: as duas RPCs contavam e moviam TODOS
--      os contatos atribuidos. Resolvido/arquivado e contato com deleted_at
--      preenchido nao estao em curso e nao podem ser movidos nem ocupar
--      capacidade. Agora so entram conversation_status = 'open' AND
--      deleted_at IS NULL — a MESMA regua de useAgents/useWarRoomData.
--   2. O candidato a substituto recebia mesmo lotado: agora so entra candidato
--      com capacidade livre medida pelas ABERTAS (abertas < max_chats).
--   3. A ordem era updated_at (qualquer toque reordenava): agora e a conversa
--      em espera ha mais tempo — conversation_status_changed_at (fallback
--      created_at), com id como desempate estavel.
--   4. Ensaiar sem mover: p_dry_run (default false) devolve a CONTAGEM do que
--      seria movido e nao escreve nada (nem contato, nem evento).
--
-- Mantem: a guarda de papel (admin/supervisor ou service_role), o busca-ativo
-- da ausencia (user_sessions, inativo por inactive_minutes) e o registro em
-- conversation_events ('overload_reassign' / 'absence_reassign').
--
-- Assinaturas novas (p_dry_run entra por ultimo, com default): a tela
-- (useAgentReassignment.ts) continua chamando sem argumento.
-- ============================================================================

-- A assinatura sem argumento sai: `()` e `(boolean DEFAULT false)` coexistem e a
-- chamada sem argumento vira ambigua ("function is not unique"). O DROP zera a
-- ACL; os REVOKE/GRANT abaixo restabelecem o acesso ao estado anterior.
DROP FUNCTION IF EXISTS public.reassign_overloaded_agents();
DROP FUNCTION IF EXISTS public.reassign_absent_agents(integer);

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents(
  p_dry_run boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_contact    RECORD;
  v_new_agent  UUID;
  v_reassigned INTEGER := 0;
BEGIN
  -- Mesma guarda de papel das versoes anteriores.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_overloaded_agents: requer perfil admin ou supervisor';
  END IF;

  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats, COUNT(c.id) AS open_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
      AND c.conversation_status = 'open'
      AND c.deleted_at IS NULL
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
    ORDER BY p.id
  LOOP
    -- Move so o EXCEDENTE de conversas ABERTAS, da que espera ha mais tempo
    -- para a mais recente (nunca updated_at).
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
        AND c.conversation_status = 'open'
        AND c.deleted_at IS NULL
      ORDER BY COALESCE(c.conversation_status_changed_at, c.created_at) ASC, c.id ASC
      LIMIT (v_overloaded.open_chats - v_overloaded.max_chats)
    LOOP
      -- Substituto: colega ativo com capacidade livre (abertas < max_chats).
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id <> v_overloaded.agent_id
        AND (
          p.max_chats IS NULL
          OR (SELECT COUNT(*) FROM contacts cc
              WHERE cc.assigned_to = p.id
                AND cc.conversation_status = 'open'
                AND cc.deleted_at IS NULL) < p.max_chats
        )
      ORDER BY (SELECT COUNT(*) FROM contacts cc
                WHERE cc.assigned_to = qm.profile_id
                  AND cc.conversation_status = 'open'
                  AND cc.deleted_at IS NULL) ASC,
               qm.profile_id ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        IF NOT p_dry_run THEN
          UPDATE public.contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
          INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
          VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                  jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));
        END IF;
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(
  inactive_minutes integer DEFAULT 30,
  p_dry_run boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_absent     RECORD;
  v_contact    RECORD;
  v_new_agent  UUID;
  v_reassigned INTEGER := 0;
BEGIN
  -- Mesma guarda de papel das versoes anteriores.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor';
  END IF;

  -- Entrada invalida fecha: minuto negativo vira intervalo invertido e marca
  -- todo mundo como ausente (movimento em massa). Sem isso, -1 movia a base.
  IF inactive_minutes IS NULL OR inactive_minutes < 0 THEN
    RAISE EXCEPTION 'reassign_absent_agents: inactive_minutes invalido: %', inactive_minutes
      USING ERRCODE = '22023';
  END IF;

  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND EXISTS (SELECT 1 FROM contacts c
                  WHERE c.assigned_to = p.id
                    AND c.conversation_status = 'open'
                    AND c.deleted_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM user_sessions us
        WHERE us.user_id = p.user_id
          AND us.is_active = true
          AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
      )
    ORDER BY p.id
  LOOP
    -- So as conversas ABERTAS do ausente, da que espera ha mais tempo.
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
        AND c.conversation_status = 'open'
        AND c.deleted_at IS NULL
      ORDER BY COALESCE(c.conversation_status_changed_at, c.created_at) ASC, c.id ASC
    LOOP
      -- Substituto: colega ativo com sessao recente E capacidade livre.
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id <> v_absent.agent_id
        AND EXISTS (
          SELECT 1 FROM user_sessions us
          WHERE us.user_id = p.user_id
            AND us.is_active = true
            AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
        )
        AND (
          p.max_chats IS NULL
          OR (SELECT COUNT(*) FROM contacts cc
              WHERE cc.assigned_to = p.id
                AND cc.conversation_status = 'open'
                AND cc.deleted_at IS NULL) < p.max_chats
        )
      ORDER BY (SELECT COUNT(*) FROM contacts cc
                WHERE cc.assigned_to = qm.profile_id
                  AND cc.conversation_status = 'open'
                  AND cc.deleted_at IS NULL) ASC,
               qm.profile_id ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        IF NOT p_dry_run THEN
          UPDATE public.contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
          INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
          VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                  jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));
        END IF;
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- ACL explicita: negar por padrao (PUBLIC/anon fora) e liberar os papeis reais.
-- O DROP acima zerou a ACL e um CREATE novo nasce com EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.reassign_overloaded_agents(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reassign_absent_agents(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_overloaded_agents(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_absent_agents(integer, boolean) TO authenticated, service_role;
