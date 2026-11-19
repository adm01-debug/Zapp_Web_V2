CREATE OR REPLACE FUNCTION public.dashboard_hourly_volume(p_days integer DEFAULT 8, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, hour integer, message_count bigint)
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
  )
  SELECT
    (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    extract(hour FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    count(*) AS message_count
  FROM public.messages m
  LEFT JOIN public.contacts ct ON ct.id = m.contact_id
  CROSS JOIN effective e
  WHERE m.created_at >= (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    - (make_interval(days => greatest(least(coalesce(p_days, 8), 31), 1) - 1))
  ) AT TIME ZONE 'America/Sao_Paulo'
    AND (p_queue IS NULL OR ct.queue_id = p_queue)
    AND ((e.is_staff AND e.agent IS NULL) OR ct.assigned_to = e.agent)
  GROUP BY 1, 2;
$function$
