CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_agent_id uuid;
  v_max integer;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'skill_based_assign: requer perfil admin ou supervisor';
  END IF;

  SELECT max_per_agent INTO v_max FROM public.queues WHERE id = p_queue_id;

  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    AND (v_max IS NULL OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_max)
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC, qm.profile_id ASC LIMIT 1;

  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
      AND (v_max IS NULL OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_max)
    ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC, qm.profile_id ASC LIMIT 1;
  END IF;

  RETURN v_agent_id;
END;
$function$
