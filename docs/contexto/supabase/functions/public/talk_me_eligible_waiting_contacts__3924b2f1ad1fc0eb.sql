CREATE OR REPLACE FUNCTION public.talk_me_eligible_waiting_contacts(p_queue_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contact_id uuid, contact_name text, avatar_url text, company text, job_title text, queue_id uuid, waiting_since timestamp with time zone, pending_message_count bigint, last_message_id uuid, last_message_content text, last_message_type text, last_message_media_url text, last_message_caption text, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    c.name,
    c.avatar_url,
    c.company,
    c.job_title,
    c.queue_id,
    COALESCE(pending.waiting_since, latest_message.created_at, c.created_at),
    pending.pending_message_count,
    latest_message.id,
    latest_message.content,
    latest_message.message_type,
    latest_message.media_url,
    latest_message.caption,
    latest_message.created_at
  FROM public.contacts c
  JOIN LATERAL (
    SELECT
      m.id,
      m.sender,
      m.content,
      m.message_type,
      m.media_url,
      m.caption,
      m.created_at
    FROM public.messages m
    WHERE m.contact_id = c.id
      AND COALESCE(m.is_deleted, false) = false
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) latest_message ON latest_message.sender = 'contact'
  LEFT JOIN LATERAL (
    SELECT
      MIN(m.created_at) AS waiting_since,
      COUNT(*) AS pending_message_count
    FROM public.messages m
    WHERE m.contact_id = c.id
      AND m.sender = 'contact'
      AND COALESCE(m.is_deleted, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.messages agent_message
        WHERE agent_message.contact_id = c.id
          AND agent_message.sender = 'agent'
          AND COALESCE(agent_message.is_deleted, false) = false
          AND (agent_message.created_at, agent_message.id) >= (m.created_at, m.id)
      )
  ) pending ON true
  WHERE (p_queue_id IS NULL OR c.queue_id = p_queue_id)
    AND (p_contact_id IS NULL OR c.id = p_contact_id)
    AND c.assigned_to IS NULL
    AND c.deleted_at IS NULL
    AND c.conversation_status IN ('open', 'waiting')
    AND c.channel_type = 'whatsapp'
    AND COALESCE(c.contact_type, 'cliente') NOT LIKE 'grupo%'
    AND c.group_category IS NULL
    AND c.phone !~* '@g[.]us$'
    AND c.phone !~ '^[0-9]+-[0-9]+$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.whatsapp_groups wg
      WHERE regexp_replace(c.phone, '[^0-9-]', '', 'g') =
            regexp_replace(wg.group_id, '[^0-9-]', '', 'g')
    );
$function$
