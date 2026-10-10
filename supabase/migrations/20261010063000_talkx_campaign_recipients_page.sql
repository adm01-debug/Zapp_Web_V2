-- Rollback: funcao nova (nao havia corpo anterior); desfazer = revogar e remover, nesta ordem:
-- REVOKE ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION IF EXISTS public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text);
--
-- N-095: lista paginada (keyset) dos destinatarios de uma campanha Talk X.
-- Retorna rows/next_cursor/total; filtros por status, segmento e busca (nome ou telefone do contato).
-- Cada linha traz o snapshot personalizado gravado e nome/telefone do contato.
-- Dono da campanha, admin/supervisor e service_role podem ler; os demais recebem 42501.
-- Nenhum campo de origem/canal no retorno.

CREATE OR REPLACE FUNCTION public.talkx_campaign_recipients_page(
  p_campaign_id uuid,
  p_page_size integer DEFAULT 20,
  p_cursor text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_segment_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
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
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_search text := NULLIF(btrim(p_search), '');
  v_rows jsonb;
  v_has_more boolean;
  v_next text;
  v_total bigint;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_can_view := true;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'talkx_campaign_recipients_page: acesso negado' USING ERRCODE = '42501';
    END IF;
    SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
    SELECT EXISTS (
      SELECT 1 FROM public.talkx_campaigns tc
      WHERE tc.id = p_campaign_id
        AND (tc.created_by = v_profile_id OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false))
    ) INTO v_can_view;
  END IF;

  IF NOT COALESCE(v_can_view, false) THEN
    RAISE EXCEPTION 'talkx_campaign_recipients_page: acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_cursor IS NOT NULL THEN
    v_cur_at := (p_cursor::jsonb ->> 'created_at')::timestamptz;
    v_cur_id := (p_cursor::jsonb ->> 'id')::uuid;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.talkx_recipients r
  LEFT JOIN public.contacts c ON c.id = r.contact_id
  WHERE r.campaign_id = p_campaign_id
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_segment_id IS NULL OR r.segment_id = p_segment_id)
    AND (v_search IS NULL OR c.name ILIKE '%' || v_search || '%' OR c.phone ILIKE '%' || v_search || '%');

  WITH page AS (
    SELECT r.*, c.name AS contact_name, c.phone AS contact_phone
    FROM public.talkx_recipients r
    LEFT JOIN public.contacts c ON c.id = r.contact_id
    WHERE r.campaign_id = p_campaign_id
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_segment_id IS NULL OR r.segment_id = p_segment_id)
      AND (v_search IS NULL OR c.name ILIKE '%' || v_search || '%' OR c.phone ILIKE '%' || v_search || '%')
      AND (v_cur_at IS NULL OR (r.created_at, r.id) > (v_cur_at, v_cur_id))
    ORDER BY r.created_at, r.id
    LIMIT v_size + 1
  ), numbered AS (
    SELECT page.*, row_number() OVER (ORDER BY page.created_at, page.id) AS rn FROM page
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'campaign_id', n.campaign_id,
      'contact_id', n.contact_id,
      'status', n.status,
      'segment_id', n.segment_id,
      'sent_at', n.sent_at,
      'delivered_at', n.delivered_at,
      'error_message', n.error_message,
      'created_at', n.created_at,
      'updated_at', n.updated_at,
      'click_count', n.click_count,
      'replied_at', n.replied_at,
      'read_at', n.read_at,
      'personalized_message', n.personalized_message,
      'contacts', CASE WHEN n.contact_name IS NULL AND n.contact_phone IS NULL THEN NULL
                       ELSE jsonb_build_object('name', n.contact_name, 'phone', n.contact_phone) END
    ) ORDER BY n.rn) FILTER (WHERE n.rn <= v_size), '[]'::jsonb),
    COALESCE(bool_or(n.rn > v_size), false),
    (SELECT jsonb_build_object('created_at', l.created_at, 'id', l.id)::text
       FROM numbered l WHERE l.rn = v_size)
  INTO v_rows, v_has_more, v_next
  FROM numbered n;

  RETURN QUERY SELECT v_rows, CASE WHEN v_has_more THEN v_next END, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) TO authenticated, service_role;