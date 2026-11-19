WITH ranked_contacts AS (
  SELECT
    c.id,
    c.queue_id,
    ROW_NUMBER() OVER(PARTITION BY c.queue_id ORDER BY c.id) - 1 AS rn_in_queue
  FROM public.contacts c
  WHERE
    c.assigned_to IS NULL
    AND c.queue_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.contact_id = c.id
        AND m.created_at > now() - interval '30 days'
    )
),
queue_agents AS (
  SELECT
    qm.queue_id,
    qm.profile_id AS agent_id,
    ROW_NUMBER() OVER(PARTITION BY qm.queue_id ORDER BY qm.profile_id) - 1 AS agent_idx,
    count(*) OVER(PARTITION BY qm.queue_id) AS agents_in_queue
  FROM public.queue_members qm
  JOIN public.profiles p    ON p.id = qm.profile_id
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE qm.is_active = true
    AND p.is_active  = true
    AND ur.role      = 'agent'
)
UPDATE public.contacts c
SET assigned_to = qa.agent_id
FROM ranked_contacts rc
JOIN queue_agents qa ON qa.queue_id = rc.queue_id
  AND qa.agent_idx = (rc.rn_in_queue % qa.agents_in_queue)
WHERE c.id = rc.id
  AND c.assigned_to IS NULL
  AND qa.agents_in_queue > 0
