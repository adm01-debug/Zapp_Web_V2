-- N-114: linha do tempo paginada (keyset) dos eventos de uma campanha Talk X.
-- Rollback: REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_campaign_timeline_page(uuid, text, integer);
--   REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.talkx_campaign_timeline_page(uuid, text, integer);
-- Retorna rows/next_cursor/total. Autorização idêntica à de
-- talkx_campaign_recipients_page (N-095/X140): só o dono da campanha
-- (talkx_campaigns.created_by), admin/supervisor (is_admin_or_supervisor) ou
-- service_role. Qualquer outro autenticado recebe 42501 — inclusive para
-- campanha inexistente (resposta idêntica, sem oráculo) — e anon cai em
-- permission denied/42501 porque não tem EXECUTE. Cursor malformado recebe
-- 22023 explícito. Ordem determinística (created_at, id); total conta só a
-- campanha; sem join por linha.

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
  v_can_view boolean := false;
  v_size integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_rows jsonb;
  v_has_more boolean;
  v_next text;
  v_total bigint;
BEGIN
  -- Autorização copiada de talkx_campaign_recipients_page (N-095/X140):
  -- service_role passa; autenticado só se é o dono (created_by) ou
  -- admin/supervisor. Qualquer outro caso levanta 42501.
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

  IF NOT COALESCE(v_can_view, false) THEN
    RAISE EXCEPTION 'talkx_campaign_timeline_page: acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Cursor malformado: erro explícito 22023 (nunca volta à 1ª página em silêncio).
  IF p_cursor IS NOT NULL THEN
    BEGIN
      v_cur_at := (p_cursor::jsonb ->> 'created_at')::timestamptz;
      v_cur_id := (p_cursor::jsonb ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'talkx_campaign_timeline_page: cursor inválido' USING ERRCODE = '22023';
    END;
    IF v_cur_at IS NULL OR v_cur_id IS NULL THEN
      RAISE EXCEPTION 'talkx_campaign_timeline_page: cursor inválido' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.talkx_campaign_events e
  WHERE e.campaign_id = p_campaign_id;

  WITH page AS (
    SELECT e.id, e.campaign_id, e.event_type, e.message, e.actor_id,
           e.entity_type, e.entity_id, e.created_at
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

-- anon NÃO tem EXECUTE de propósito (igual ao N-095): a chamada como anon cai
-- em "permission denied"/42501 antes da função rodar.
REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) TO authenticated, service_role;
