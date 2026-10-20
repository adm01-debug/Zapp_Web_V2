-- Migration: guard_secdef_batch
-- Tarefa T6 do handoff de auditoria 27/08/2026
-- Adiciona guards de autorização em 5 funções SECURITY DEFINER que
-- tinham `authenticated=X` na ACL mas nenhum controle interno de acesso.
--
-- Estratégia por função:
--   cleanup_expired_challenges  → bloquear authenticated totalmente (só webauthn edge service_role)
--   cleanup_link_preview_cache  → bloquear authenticated totalmente (só cron postgres)
--   reassign_absent_agents      → exigir is_admin_or_supervisor (front legítimo, mas só admin)
--   reassign_overloaded_agents  → exigir is_admin_or_supervisor (idem)
--   skill_based_assign          → exigir is_admin_or_supervisor (idem)
--
-- BUG PRÉ-EXISTENTE DOCUMENTADO:
--   reassign_absent_agents referencia p.last_seen_at que NÃO existe em profiles.
--   A função compilou (PG valida SQL de loops em runtime), mas falha ao ser invocada
--   por admin/supervisor. Esse bug é anterior a esta migration; o guard é um avanço
--   independente (bloqueia não-admins antes de chegar no erro). Fix do schema de
--   presença é rastreado separadamente.

-- 1. cleanup_expired_challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_expired_challenges: operacao restrita a service_role';
  END IF;
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$$;

-- 2. cleanup_link_preview_cache
CREATE OR REPLACE FUNCTION public.cleanup_link_preview_cache()
RETURNS TABLE(deleted_count integer, remaining_count integer, table_size_bytes bigint, duration_ms integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_deleted INTEGER := 0;
  v_remaining INTEGER := 0;
  v_size BIGINT := 0;
  v_duration INTEGER := 0;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_link_preview_cache: operacao restrita a service_role';
  END IF;
  WITH d AS (DELETE FROM public.link_preview_cache WHERE expires_at < now() RETURNING 1)
  SELECT COUNT(*) INTO v_deleted FROM d;
  SELECT COUNT(*) INTO v_remaining FROM public.link_preview_cache;
  SELECT pg_total_relation_size('public.link_preview_cache') INTO v_size;
  v_duration := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::INTEGER;
  INSERT INTO public.link_preview_cache_metrics(deleted_count, remaining_count, table_size_bytes, duration_ms)
  VALUES (v_deleted, v_remaining, v_size, v_duration);
  RETURN QUERY SELECT v_deleted, v_remaining, v_size, v_duration;
END;
$$;

-- 3. reassign_absent_agents (BUG: last_seen_at — documentado acima)
CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor';
  END IF;
  FOR v_absent IN
    SELECT p.id AS agent_id FROM profiles p
    WHERE p.is_active = true AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  LOOP
    FOR v_contact IN SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_absent.agent_id LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true AND p.is_active = true AND p.id != v_absent.agent_id
        AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
      ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1;
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
$$;

-- 4. reassign_overloaded_agents
CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
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
$$;

-- 5. skill_based_assign
CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'skill_based_assign: requer perfil admin ou supervisor';
  END IF;
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1;
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1;
  END IF;
  RETURN v_agent_id;
END;
$$;
