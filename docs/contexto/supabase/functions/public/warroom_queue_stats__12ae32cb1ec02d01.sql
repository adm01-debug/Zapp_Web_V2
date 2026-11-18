CREATE OR REPLACE FUNCTION public.warroom_queue_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT public.is_admin_or_supervisor(auth.uid()) AS is_staff
  ),
  ep AS (
    -- Episódio em andamento: resolvido/arquivado não é espera nem atendimento.
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
  ),
  sla AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at,
      s.first_response_breached, s.sla_configuration_id
    FROM public.conversation_sla s
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  cfg AS (
    SELECT
      sl.contact_id,
      COALESCE(sc.first_response_minutes, def.first_response_minutes) AS first_response_minutes
    FROM sla sl
    LEFT JOIN public.sla_configurations sc ON sc.id = sl.sla_configuration_id
    LEFT JOIN LATERAL (
      SELECT min(dc.first_response_minutes) AS first_response_minutes
      FROM public.sla_configurations dc
      WHERE dc.is_default IS TRUE AND dc.is_active IS TRUE
    ) def ON TRUE
  ),
  agg AS (
    SELECT
      q.id,
      q.name,
      q.color,
      count(e.id) FILTER (WHERE e.assigned_to IS NULL) AS waiting,
      count(e.id) FILTER (WHERE e.assigned_to IS NOT NULL AND e.conversation_status = 'open') AS in_progress,
      count(e.id) FILTER (WHERE sl.first_response_breached IS TRUE) AS breaches,
      count(e.id) FILTER (
        WHERE sl.first_response_at IS NULL
          AND sl.first_response_breached IS NOT TRUE
          AND cf.first_response_minutes IS NOT NULL
          AND now() >= sl.first_message_at + (cf.first_response_minutes * 0.8) * interval '1 minute'
      ) AS warnings,
      count(e.id) FILTER (
        WHERE sl.first_response_at IS NULL AND cf.first_response_minutes IS NOT NULL
      ) AS measurable,
      round(avg(EXTRACT(EPOCH FROM (now() - sl.first_message_at)) / 60.0)
            FILTER (WHERE e.assigned_to IS NULL AND sl.first_message_at IS NOT NULL))::integer AS avg_wait_minutes
    FROM public.queues q
    LEFT JOIN ep e ON e.queue_id = q.id
    LEFT JOIN sla sl ON sl.contact_id = e.id
    LEFT JOIN cfg cf ON cf.contact_id = e.id
    WHERE q.is_active IS TRUE
    GROUP BY q.id, q.name, q.color
  )
  SELECT CASE
    WHEN (SELECT is_staff FROM guard) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'color', a.color,
        'waiting', a.waiting,
        'inProgress', a.in_progress,
        'slaBreaches', a.breaches,
        'slaWarnings', CASE WHEN a.measurable = 0 THEN NULL ELSE a.warnings END,
        'avgWaitTime', a.avg_wait_minutes
      ) ORDER BY a.name, a.id)
      FROM agg a
    ), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$function$
