-- Treat TALK ME search input as literal text and cap the term at 80 characters.
--
-- rollback: restore public.talk_me_list_waiting from
-- 20260930310000_harden_talk_me_authorization_and_groups.sql

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_term text := LEFT(BTRIM(COALESCE(p_search, '')), 80);
  v_escaped_term text := replace(
    replace(
      replace(v_term, E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  );
BEGIN
  RETURN QUERY
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
      c.contact_id,
      c.contact_name,
      c.avatar_url,
      c.company,
      c.job_title,
      aq.id AS queue_id,
      aq.name AS queue_name,
      aq.color AS queue_color,
      c.waiting_since,
      c.pending_message_count,
      c.last_message_id,
      c.last_message_content,
      c.last_message_type,
      c.last_message_media_url,
      c.last_message_caption,
      c.last_message_at
    FROM public.talk_me_eligible_waiting_contacts(p_queue_id, NULL) c
    JOIN allowed_queue aq ON aq.id = c.queue_id
    WHERE (
        v_term = ''
        OR c.contact_name ILIKE '%' || v_escaped_term || '%' ESCAPE '\'
        OR COALESCE(c.company, '') ILIKE '%' || v_escaped_term || '%' ESCAPE '\'
        OR COALESCE(c.job_title, '') ILIKE '%' || v_escaped_term || '%' ESCAPE '\'
        OR c.last_message_content ILIKE '%' || v_escaped_term || '%' ESCAPE '\'
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
END;
$function$;

REVOKE ALL ON FUNCTION public.talk_me_list_waiting(uuid, text, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talk_me_list_waiting(uuid, text, integer, timestamptz, uuid) TO authenticated;
