CREATE OR REPLACE FUNCTION public.talk_me_list_queues()
 RETURNS TABLE(queue_id uuid, queue_name text, queue_color text, waiting_count bigint, oldest_waiting_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH caller AS (
    SELECT
      auth.uid() AS user_id,
      (
        SELECT p.id
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.is_active IS TRUE
        LIMIT 1
      ) AS profile_id,
      public.is_admin_or_supervisor(auth.uid()) AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.feature_flags f
        WHERE f.key = 'inbox.talk-me'
          AND f.enabled IS TRUE
      ) AS feature_enabled
  ),
  allowed_queues AS (
    SELECT q.id, q.name, q.color
    FROM public.queues q
    CROSS JOIN caller x
    WHERE x.user_id IS NOT NULL
      AND x.profile_id IS NOT NULL
      AND x.feature_enabled
      AND q.is_active = true
      AND (
        x.is_admin
        OR EXISTS (
          SELECT 1
          FROM public.queue_members qm
          WHERE qm.queue_id = q.id
            AND qm.profile_id = x.profile_id
            AND qm.is_active = true
        )
      )
  ),
  eligible AS (
    SELECT c.queue_id, c.waiting_since
    FROM public.talk_me_eligible_waiting_contacts(NULL, NULL) c
    JOIN allowed_queues aq ON aq.id = c.queue_id
  )
  SELECT
    aq.id,
    aq.name,
    aq.color,
    COUNT(e.queue_id),
    MIN(e.waiting_since)
  FROM allowed_queues aq
  LEFT JOIN eligible e ON e.queue_id = aq.id
  GROUP BY aq.id, aq.name, aq.color
  ORDER BY COUNT(e.queue_id) DESC, aq.name ASC, aq.id ASC;
$function$
