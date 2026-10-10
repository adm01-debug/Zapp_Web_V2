-- N-114: linha do tempo paginada (keyset) dos eventos de uma campanha Talk X.
-- Rollback: REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role; DROP FUNCTION IF EXISTS public.talkx_campaign_timeline_page(uuid, text, integer);
-- Retorna rows/next_cursor/total. Leitura: dono da campanha
-- (talkx_campaigns.created_by), admin/supervisor ou service_role. Conta anon ou
-- sem vínculo recebe linha vazia ('[]', NULL, 0), nunca 42501. A permissão é
-- checada contra talkx_campaigns (mesma regra do RLS SELECT de
-- talkx_campaign_events, sem bypass possível: DEFINER com igualdade explícita).
-- Ordem determinística (created_at, id); total conta só a campanha; sem join por
-- linha (actor_name removido — era N+1). Cursor inválido volta à 1ª página.

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
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_can_view := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
    SELECT EXISTS (
      SELECT 1 FROM public.talkx_campaigns tc
      WHERE tc.id = p_campaign_id
        AND (tc.created_by = v_profile_id OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false))
    ) INTO v_can_view;
  END IF;

  IF NOT COALESCE(v_can_view, false) THEN
    RETURN QUERY SELECT '[]'::jsonb, NULL::text, 0::bigint;
    RETURN;
  END IF;

  IF p_cursor IS NOT NULL THEN
    BEGIN
      v_cur_at := (p_cursor::jsonb ->> 'created_at')::timestamptz;
      v_cur_id := (p_cursor::jsonb ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_cur_at := NULL;
      v_cur_id := NULL;
    END;
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

-- anon TEM execute de propósito: sem isso o Postgres barra a chamada com
-- "permission denied" antes da função rodar; com execute, anon entra na função
-- e recebe a linha vazia ('[]', NULL, 0) — nunca dado (auth.uid() nulo nunca
-- passa na checagem explícita abaixo).
REVOKE ALL ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_timeline_page(uuid, text, integer) TO anon, authenticated, service_role;
