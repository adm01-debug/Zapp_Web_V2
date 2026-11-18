CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_queue uuid DEFAULT NULL,
  p_agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH effective AS MATERIALIZED (
    SELECT
      public.is_admin_or_supervisor(auth.uid()) AS is_staff,
      CASE WHEN public.is_admin_or_supervisor(auth.uid())
           THEN p_agent
           ELSE public.get_profile_id_for_user(auth.uid())
      END AS agent
  ),
  filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c, effective e
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND ((e.is_staff AND e.agent IS NULL) OR c.assigned_to = e.agent)
      AND (p_since IS NULL OR c.updated_at >= p_since)
      AND (p_until IS NULL OR c.updated_at <= p_until)
      AND c.deleted_at IS NULL
  ),
  sla_today AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at, s.first_response_breached
    FROM conversation_sla s
    WHERE s.first_message_at >= COALESCE(p_since, (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo')
      AND (p_until IS NULL OR s.first_message_at <= p_until)
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  per_queue AS (
    SELECT
      f.queue_id,
      count(*) FILTER (WHERE f.assigned_to IS NULL) AS waiting,
      count(*) FILTER (WHERE f.assigned_to IS NOT NULL) AS in_service,
      round((avg(EXTRACT(EPOCH FROM (st.first_response_at - st.first_message_at)))
             FILTER (WHERE st.first_response_at IS NOT NULL))::numeric) AS avg_response,
      round((100.0 * count(*) FILTER (WHERE st.first_response_breached IS FALSE)
             / NULLIF(count(*) FILTER (WHERE st.contact_id IS NOT NULL), 0))::numeric) AS sla_rate
    FROM filtered f
    LEFT JOIN sla_today st ON st.contact_id = f.id
    WHERE f.queue_id IS NOT NULL
    GROUP BY f.queue_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'open', (SELECT count(*) FROM filtered WHERE assigned_to IS NOT NULL AND conversation_status = 'open'),
    'pending', (SELECT count(*) FROM filtered WHERE assigned_to IS NULL AND queue_id IS NOT NULL AND conversation_status NOT IN ('resolved', 'archived')),
    'myActive', (SELECT count(*) FROM filtered WHERE assigned_to = public.get_profile_id_for_user(auth.uid())),
    'queues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'queueId', queue_id,
        'waiting', waiting,
        'inService', in_service,
        'avgResponse', avg_response,
        'slaRate', sla_rate
      ))
      FROM per_queue
    ), '[]'::jsonb)
  );
$function$;
