-- N-114: linha do tempo paginada (keyset) dos eventos de uma campanha Talk X.
-- Retorna rows/next_cursor/total; filtros por campaign_id e cursor.
-- Dono da campanha, admin/supervisor e service_role podem ler; os demais recebem 42501.
-- Rollback: revogar e remover a funcao, na ordem inversa.
-- Rollback (SQL executavel, na ordem):
--   REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.talkx_campaign_timeline_page(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.talkx_campaign_timeline_page(
  p_campaign_id uuid,
  p_cursor text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(rows jsonb, next_cursor text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_can_view boolean;
  v_size integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_rows jsonb;
  v_has_more boolean;
  v_next text;
  v_total bigint;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_can_view := true;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'talkx_campaign_timeline_page: acesso negado' USING ERRCODE = '42501';
    END IF;
    SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
    SELECT EXISTS (
      SELECT 1 FROM public.talkx_campaigns tc
      WHERE tc.id = p_campaign_id
        AND (tc.created_by = v_profile_id OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false))
    ) INTO v_can_view;
  END IF;

  IF NOT COALESCE(v_can_view, false) THEN
    RAISE EXCEPTION 'talkx_campaign_timeline_page: acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_cursor IS NOT NULL THEN
    v_cur_at := (p_cursor::jsonb ->> 'created_at')::timestamptz;
    v_cur_id := (p_cursor::jsonb ->> 'id')::uuid;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.talkx_campaign_events e
  WHERE e.campaign_id = p_campaign_id;

  WITH page AS (
    SELECT e.*
    FROM public.talkx_campaign_events e
    WHERE e.campaign_id = p_campaign_id
      AND (v_cur_at IS NULL OR (e.created_at, e.id) < (v_cur_at, v_cur_id))
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_size + 1
  ), numbered AS (
    SELECT page.*, row_number() OVER (ORDER BY page.created_at DESC, page.id DESC) AS rn FROM page
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'campaign_id', n.campaign_id,
      'event_type', n.event_type,
      'message', n.message,
      'actor_id', n.actor_id,
      'actor_name', (SELECT p.name FROM public.profiles p WHERE p.id = n.actor_id),
      'entity_type', n.entity_type,
      'entity_id', n.entity_id,
      'created_at', n.created_at
    ) ORDER BY n.rn) FILTER (WHERE n.rn <= v_size), '[]'::jsonb),
    COALESCE(bool_or(n.rn > v_size), false),
    (SELECT jsonb_build_object('created_at', l.created_at, 'id', l.id)::text
       FROM numbered l WHERE l.rn = v_size)
  INTO v_rows, v_has_more, v_next
  FROM numbered n;

  RETURN QUERY SELECT v_rows, CASE WHEN v_has_more THEN v_next END, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) TO authenticated, service_role;