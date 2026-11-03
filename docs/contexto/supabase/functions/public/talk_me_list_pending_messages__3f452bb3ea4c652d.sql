CREATE OR REPLACE FUNCTION public.talk_me_list_pending_messages(p_contact_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id uuid, sender text, content text, message_type text, media_url text, caption text, created_at timestamp with time zone)
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
  authorized_contact AS (
    SELECT e.contact_id
    FROM public.talk_me_eligible_waiting_contacts(NULL, p_contact_id) e
    CROSS JOIN caller x
    WHERE x.user_id IS NOT NULL
      AND x.profile_id IS NOT NULL
      AND x.feature_enabled
      AND EXISTS (
        SELECT 1
        FROM public.queues q
        WHERE q.id = e.queue_id
          AND q.is_active = true
      )
      AND (
        x.is_admin
        OR EXISTS (
          SELECT 1
          FROM public.queue_members qm
          WHERE qm.queue_id = e.queue_id
            AND qm.profile_id = x.profile_id
            AND qm.is_active = true
        )
      )
  ),
  recent AS (
    SELECT
      m.id,
      m.sender,
      m.content,
      m.message_type,
      m.media_url,
      m.caption,
      m.created_at
    FROM public.messages m
    JOIN authorized_contact ac ON ac.contact_id = m.contact_id
    WHERE m.sender = 'contact'
      AND COALESCE(m.is_deleted, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.messages agent_message
        WHERE agent_message.contact_id = m.contact_id
          AND agent_message.sender = 'agent'
          AND COALESCE(agent_message.is_deleted, false) = false
          AND (agent_message.created_at, agent_message.id) >= (m.created_at, m.id)
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  )
  SELECT
    r.id,
    r.sender,
    r.content,
    r.message_type,
    r.media_url,
    r.caption,
    r.created_at
  FROM recent r
  ORDER BY r.created_at ASC, r.id ASC;
$function$
