-- Harden TALK ME after the multi-agent security, concurrency and data-model audit.
--
-- Keeps the public RPC signatures stable while making the server-side feature flag,
-- active profile and canonical WhatsApp-group model authoritative. The claim UPDATE
-- repeats every eligibility and authorization predicate so a committed revocation
-- that races with a click wins before ownership changes.
--
-- rollback: restore the three function bodies from 20260930290000_talk_me_queue_claim.sql

CREATE OR REPLACE FUNCTION public.talk_me_list_queues()
RETURNS TABLE (
  queue_id uuid,
  queue_name text,
  queue_color text,
  waiting_count bigint,
  oldest_waiting_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    SELECT
      c.queue_id,
      COALESCE(pending.waiting_since, latest_message.created_at, c.created_at) AS waiting_since
    FROM public.contacts c
    JOIN allowed_queues aq ON aq.id = c.queue_id
    JOIN LATERAL (
      SELECT m.sender, m.created_at
      FROM public.messages m
      WHERE m.contact_id = c.id
        AND COALESCE(m.is_deleted, false) = false
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) latest_message ON latest_message.sender = 'contact'
    LEFT JOIN LATERAL (
      SELECT MIN(m.created_at) AS waiting_since
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
    WHERE c.assigned_to IS NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status IN ('open', 'waiting')
      AND c.channel_type = 'whatsapp'
      AND c.group_category IS NULL
      AND c.phone !~* '@g[.]us$'
      AND c.phone !~ '^[0-9]+-[0-9]+$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_groups wg
        WHERE regexp_replace(c.phone, '[^0-9-]', '', 'g') =
              regexp_replace(wg.group_id, '[^0-9-]', '', 'g')
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.talk_me_list_waiting(
  p_queue_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_waiting_since timestamptz DEFAULT NULL,
  p_cursor_contact_id uuid DEFAULT NULL
)
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  avatar_url text,
  company text,
  job_title text,
  queue_id uuid,
  queue_name text,
  queue_color text,
  waiting_since timestamptz,
  pending_message_count bigint,
  last_message_id uuid,
  last_message_content text,
  last_message_type text,
  last_message_media_url text,
  last_message_caption text,
  last_message_at timestamptz,
  total_count bigint,
  queue_position bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  allowed_queue AS (
    SELECT q.id, q.name, q.color
    FROM public.queues q
    CROSS JOIN caller x
    WHERE q.id = p_queue_id
      AND q.is_active = true
      AND x.user_id IS NOT NULL
      AND x.profile_id IS NOT NULL
      AND x.feature_enabled
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
    SELECT
      c.id AS contact_id,
      c.name AS contact_name,
      c.avatar_url,
      c.company,
      c.job_title,
      aq.id AS queue_id,
      aq.name AS queue_name,
      aq.color AS queue_color,
      COALESCE(pending.waiting_since, latest_message.created_at, c.created_at) AS waiting_since,
      pending.pending_message_count,
      latest_message.id AS last_message_id,
      latest_message.content AS last_message_content,
      latest_message.message_type AS last_message_type,
      latest_message.media_url AS last_message_media_url,
      latest_message.caption AS last_message_caption,
      latest_message.created_at AS last_message_at
    FROM public.contacts c
    JOIN allowed_queue aq ON aq.id = c.queue_id
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
    WHERE c.assigned_to IS NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status IN ('open', 'waiting')
      AND c.channel_type = 'whatsapp'
      AND c.group_category IS NULL
      AND c.phone !~* '@g[.]us$'
      AND c.phone !~ '^[0-9]+-[0-9]+$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_groups wg
        WHERE regexp_replace(c.phone, '[^0-9-]', '', 'g') =
              regexp_replace(wg.group_id, '[^0-9-]', '', 'g')
      )
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR c.name ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(c.company, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(c.job_title, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR latest_message.content ILIKE '%' || BTRIM(p_search) || '%'
      )
  ),
  ranked AS (
    SELECT
      e.*,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (ORDER BY e.waiting_since ASC, e.contact_id ASC) AS queue_position
    FROM eligible e
  )
  SELECT
    r.contact_id,
    r.contact_name,
    r.avatar_url,
    r.company,
    r.job_title,
    r.queue_id,
    r.queue_name,
    r.queue_color,
    r.waiting_since,
    r.pending_message_count,
    r.last_message_id,
    r.last_message_content,
    r.last_message_type,
    r.last_message_media_url,
    r.last_message_caption,
    r.last_message_at,
    r.total_count,
    r.queue_position
  FROM ranked r
  WHERE p_cursor_waiting_since IS NULL
     OR (
       p_cursor_contact_id IS NOT NULL
       AND (r.waiting_since, r.contact_id) > (p_cursor_waiting_since, p_cursor_contact_id)
     )
  ORDER BY r.waiting_since ASC, r.contact_id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.talk_me_claim(p_contact_id uuid)
RETURNS TABLE (
  contact_id uuid,
  queue_id uuid,
  assigned_to uuid,
  conversation_status text,
  claimed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_queue_id uuid;
  v_assigned_to uuid;
  v_status text;
  v_claimed_at timestamptz;
  v_last_sender text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT p.id
    INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id
    AND p.is_active IS TRUE
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT c.queue_id, c.assigned_to, c.conversation_status
    INTO v_queue_id, v_assigned_to, v_status
  FROM public.contacts c
  WHERE c.id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND OR v_queue_id IS NULL THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF v_assigned_to = v_profile_id THEN
    SELECT al.created_at
      INTO v_claimed_at
    FROM public.audit_logs al
    WHERE al.user_id = v_user_id
      AND al.action = 'talk_me_claim'
      AND al.entity_type = 'contact'
      AND al.entity_id = p_contact_id
    ORDER BY al.created_at ASC, al.id ASC
    LIMIT 1;

    IF v_claimed_at IS NOT NULL THEN
      RETURN QUERY
      SELECT p_contact_id, v_queue_id, v_profile_id, v_status, v_claimed_at;
      RETURN;
    END IF;
  END IF;

  SELECT m.sender
    INTO v_last_sender
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND COALESCE(m.is_deleted, false) = false
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_last_sender IS DISTINCT FROM 'contact' THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.contacts c
  SET assigned_to = v_profile_id,
      conversation_status = 'open'
  WHERE c.id = p_contact_id
    AND c.assigned_to IS NULL
    AND c.deleted_at IS NULL
    AND c.conversation_status IN ('open', 'waiting')
    AND c.channel_type = 'whatsapp'
    AND c.group_category IS NULL
    AND c.phone !~* '@g[.]us$'
    AND c.phone !~ '^[0-9]+-[0-9]+$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.whatsapp_groups wg
      WHERE regexp_replace(c.phone, '[^0-9-]', '', 'g') =
            regexp_replace(wg.group_id, '[^0-9-]', '', 'g')
    )
    AND EXISTS (
      SELECT 1
      FROM public.feature_flags f
      WHERE f.key = 'inbox.talk-me'
        AND f.enabled IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_profile_id
        AND p.user_id = v_user_id
        AND p.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.queues q
      WHERE q.id = c.queue_id
        AND q.is_active = true
        AND (
          public.is_admin_or_supervisor(v_user_id)
          OR EXISTS (
            SELECT 1
            FROM public.queue_members qm
            WHERE qm.queue_id = q.id
              AND qm.profile_id = v_profile_id
              AND qm.is_active = true
          )
        )
    )
    AND (
      SELECT m.sender
      FROM public.messages m
      WHERE m.contact_id = c.id
        AND COALESCE(m.is_deleted, false) = false
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) = 'contact';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'talk_me_claim',
    'contact',
    p_contact_id,
    jsonb_build_object('queue_id', v_queue_id, 'source', 'talk_me')
  );

  RETURN QUERY
  SELECT p_contact_id, v_queue_id, v_profile_id, 'open'::text, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.talk_me_list_queues() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.talk_me_list_waiting(uuid, text, integer, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.talk_me_claim(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.talk_me_list_queues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.talk_me_list_waiting(uuid, text, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.talk_me_claim(uuid) TO authenticated;

COMMENT ON FUNCTION public.talk_me_list_queues() IS
  'Filas ativas autorizadas para TALK ME, com perfil e feature flag ativos.';
COMMENT ON FUNCTION public.talk_me_list_waiting(uuid, text, integer, timestamptz, uuid) IS
  'Conversas individuais TALK ME aguardando aceite, com autorizacao revalidada.';
COMMENT ON FUNCTION public.talk_me_claim(uuid) IS
  'Aceita uma conversa TALK ME com elegibilidade e autorizacao revalidadas no UPDATE.';
