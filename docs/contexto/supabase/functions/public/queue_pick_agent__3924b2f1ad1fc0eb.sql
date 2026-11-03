CREATE OR REPLACE FUNCTION public.queue_pick_agent(p_queue_id uuid, p_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_q record;
  v_agent uuid;
  v_last_agent uuid;
BEGIN
  SELECT id, is_active, paused, distribution, max_per_agent, sticky_enabled
    INTO v_q
  FROM public.queues
  WHERE id = p_queue_id;

  IF NOT FOUND OR v_q.paused IS TRUE THEN
    RETURN NULL;
  END IF;

  IF v_q.sticky_enabled AND p_contact_id IS NOT NULL THEN
    SELECT ce.to_agent_id INTO v_last_agent
    FROM public.conversation_events ce
    WHERE ce.contact_id = p_contact_id AND ce.to_agent_id IS NOT NULL
    ORDER BY ce.created_at DESC, ce.id DESC
    LIMIT 1;

    IF v_last_agent IS NOT NULL THEN
      SELECT qm.profile_id INTO v_agent
      FROM public.queue_members qm
      JOIN public.profiles p ON p.id = qm.profile_id
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE qm.queue_id = p_queue_id
        AND qm.profile_id = v_last_agent
        AND qm.is_active = true
        AND p.is_active = true
        AND ur.role = 'agent'
        AND (v_q.max_per_agent IS NULL
             OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_q.max_per_agent)
        AND (v_q.distribution <> 'skill'
             OR NOT EXISTS (
                  SELECT 1 FROM public.queue_skill_requirements qsr
                  WHERE qsr.queue_id = p_queue_id
                    AND NOT EXISTS (
                      SELECT 1 FROM public.agent_skills ags
                      WHERE ags.profile_id = qm.profile_id
                        AND ags.skill_name = qsr.skill_name
                        AND ags.skill_level >= qsr.min_level)));
      IF v_agent IS NOT NULL THEN
        RETURN v_agent;
      END IF;
    END IF;
  END IF;

  SELECT qm.profile_id INTO v_agent
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND ur.role = 'agent'
    AND (v_q.max_per_agent IS NULL
         OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_q.max_per_agent)
    AND (v_q.distribution <> 'skill'
         OR NOT EXISTS (
              SELECT 1 FROM public.queue_skill_requirements qsr
              WHERE qsr.queue_id = p_queue_id
                AND NOT EXISTS (
                  SELECT 1 FROM public.agent_skills ags
                  WHERE ags.profile_id = qm.profile_id
                    AND ags.skill_name = qsr.skill_name
                    AND ags.skill_level >= qsr.min_level)))
  ORDER BY
    CASE WHEN v_q.distribution = 'round_robin'
         THEN GREATEST(
           (SELECT MAX(ce.created_at)
            FROM public.conversation_events ce
            WHERE ce.to_agent_id = qm.profile_id
              AND (ce.to_queue_id = p_queue_id
                   OR ce.metadata->>'new_queue' = p_queue_id::text)),
           (SELECT MAX(c.created_at) FROM public.contacts c
            WHERE c.assigned_to = qm.profile_id AND c.queue_id = p_queue_id)
         )
    END ASC NULLS FIRST,
    (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC,
    qm.profile_id ASC
  LIMIT 1;

  RETURN v_agent;
END;
$function$
