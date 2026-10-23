-- N-131 / N-095: adiciona parametro p_segment_id (uuid) a talkx_campaign_recipients_page.
-- Rollback:
--   REVOKE ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid,integer,text,text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.talkx_campaign_recipients_page(uuid,integer,text,text,uuid,text);
--   (restaurar versao de 20261010062941 se necessario)
--
-- A funcao original (20261010062941) tem 5 argumentos sem p_segment_id.
-- DROP + CREATE e necessario porque o PostgreSQL rejeita CREATE OR REPLACE
-- que muda o numero de parametros.

DROP FUNCTION IF EXISTS public.talkx_campaign_recipients_page(uuid, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.talkx_campaign_recipients_page(
  p_campaign_id uuid,
  p_page_size integer DEFAULT 50,
  p_cursor text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_segment_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_can_view boolean;
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_search text := NULLIF(btrim(p_search), '');
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next text := NULL;
  v_total bigint := 0;
  v_kpis jsonb := '{}'::jsonb;
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

  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown') THEN
    RAISE EXCEPTION 'talkx_campaign_recipients_page: status invalido' USING ERRCODE = '22023';
  END IF;

  IF p_cursor IS NOT NULL THEN
    v_cur_at := (p_cursor::jsonb ->> 'created_at')::timestamptz;
    v_cur_id := (p_cursor::jsonb ->> 'id')::uuid;
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'sent', count(*) FILTER (WHERE r.status = 'sent'),
    'delivered', count(*) FILTER (WHERE r.status = 'delivered'),
    'failed', count(*) FILTER (WHERE r.status = 'failed'),
    'pending', count(*) FILTER (WHERE r.status IN ('pending', 'sending')),
    'outcome_unknown', count(*) FILTER (WHERE r.status = 'outcome_unknown')
  ) INTO v_kpis
  FROM public.talkx_recipients r
  WHERE r.campaign_id = p_campaign_id;

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
      'manual_retry_count', n.manual_retry_count,
      'created_at', n.created_at,
      'updated_at', n.updated_at,
      'contacts', CASE WHEN n.contact_id IS NULL THEN NULL
                       ELSE jsonb_build_object('name', n.contact_name, 'phone', n.contact_phone) END
    ) ORDER BY n.rn) FILTER (WHERE n.rn <= v_size), '[]'::jsonb),
    COALESCE(bool_or(n.rn > v_size), false),
    (SELECT jsonb_build_object('created_at', l.created_at, 'id', l.id)::text
       FROM numbered l WHERE l.rn = v_size)
  INTO v_rows, v_has_more, v_next
  FROM numbered n;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'next_cursor', CASE WHEN v_has_more THEN v_next ELSE NULL END,
    'total', v_total,
    'kpis', v_kpis
  );
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.talkx_campaign_recipients_page(uuid, integer, text, text, uuid, text) IS
  'Talk X (N-131): pagina de destinatarios por cursor keyset (created_at,id) com contato embutido, filtros de status e segmento, busca por nome/telefone e KPIs da campanha calculados no servidor. Retorna jsonb {rows,next_cursor,total,kpis}. Nenhum campo de origem/canal.';
