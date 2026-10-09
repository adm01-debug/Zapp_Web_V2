-- talkx_campaign_recipients_page: lista paginada dos destinatários da campanha
-- Rollback: Remove a função talkx_campaign_recipients_page e restaura os grants anteriores
-- Rollback (SQL executável, na ordem):
--   REVOKE EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) FROM authenticated, service_role;
--   GRANT ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) TO PUBLIC, anon;
--   DROP FUNCTION IF EXISTS public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.talkx_campaign_recipients_page(
  p_campaign_id uuid,
  p_page_size integer DEFAULT 20,
  p_cursor text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_segment_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  rows jsonb,
  next_cursor text,
  total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_can_view boolean;
  v_rows jsonb;
  v_next_cursor text;
  v_total bigint;
BEGIN
  -- Authorization: only the creator or admin/supervisor can view
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_can_view := true;
  ELSE
    v_profile_id := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
    SELECT EXISTS(
      SELECT 1 FROM public.talkx_campaigns tc
      WHERE tc.id = p_campaign_id
      AND (tc.created_by = v_profile_id OR public.is_admin_or_supervisor(auth.uid()))
    ) INTO v_can_view;
  END IF;

  IF NOT v_can_view THEN
    RAISE EXCEPTION 'talkx_campaign_recipients_page: acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Total count (unpaginated)
  SELECT count(*) INTO v_total
  FROM public.talkx_recipients r
  WHERE r.campaign_id = p_campaign_id
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_segment_id IS NULL OR r.segment_id = p_segment_id)
    AND (p_search IS NULL OR r.contact_id::text ILIKE '%' || p_search || '%');

  -- Paginated rows with cursor
  WITH paginated AS (
    SELECT r.*
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign_id
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_segment_id IS NULL OR r.segment_id = p_segment_id)
      AND (p_search IS NULL OR r.contact_id::text ILIKE '%' || p_search || '%')
      AND (p_cursor IS NULL OR (r.created_at > (SELECT (p_cursor::jsonb)->>'created_at')::timestamptz OR (r.created_at = (SELECT (p_cursor::jsonb)->>'created_at')::timestamptz AND r.id > (SELECT (p_cursor::jsonb)->>'id')::uuid)))
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT p_page_size
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'campaign_id', r.campaign_id,
        'contact_id', r.contact_id,
        'status', r.status,
        'segment_id', r.segment_id,
        'sent_at', r.sent_at,
        'delivered_at', r.delivered_at,
        'error_message', r.error_message,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'click_count', r.click_count,
        'replied_at', r.replied_at,
        'read_at', r.read_at
      )
    ) INTO v_rows
    FROM paginated r;

  -- Next cursor: last row of the page (subquery, not CTE)
  SELECT jsonb_build_object(
    'created_at', r.created_at::text,
    'id', r.id::text
  )::text INTO v_next_cursor
  FROM (
    SELECT r.created_at, r.id
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign_id
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_segment_id IS NULL OR r.segment_id = p_segment_id)
      AND (p_search IS NULL OR r.contact_id::text ILIKE '%' || p_search || '%')
      AND (p_cursor IS NULL OR (r.created_at > (SELECT (p_cursor::jsonb)->>'created_at')::timestamptz OR (r.created_at = (SELECT (p_cursor::jsonb)->>'created_at')::timestamptz AND r.id > (SELECT (p_cursor::jsonb)->>'id')::uuid)))
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 1
  ) r;

  IF v_next_cursor = '{"created_at":null,"id":null}' THEN
    v_next_cursor := NULL;
  END IF;

  RETURN QUERY SELECT v_rows, v_next_cursor, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) TO authenticated, service_role;
