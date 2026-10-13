-- talkx_campaign_resume_precheck
-- Rollback: dropa as duas funcoes novas desta migration; nao existiam antes e nada mais e alterado.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_campaign_segment_progress(uuid);
--   drop function if exists public.talkx_campaign_resume_precheck(uuid);
-- N-097 / X142 (parte): pre-checagem de retomada no SERVIDOR. Funcao nova, de leitura
-- (STABLE), aditiva: nada existente e alterado. Antes de retomar uma campanha pausada, o
-- banco confere (1) a conexao WhatsApp da campanha, (2) a janela de envio agora e
-- (3) os destinatarios pendentes suprimidos (talkx_blacklist ativa por contato ou telefone,
-- mesmo criterio de talkx_audience_*). NAO decide a retomada: devolve os fatos e `blockers`;
-- `can_resume` = nenhum bloqueio. Escopo: admin/supervisor ou service_role (como X033).
-- Tambem entrega talkx_campaign_segment_progress: progresso por segmento, na ordem de envio.
-- Fora desta entrega (restam de X142): status do template,
-- limite diario, recorrencia, autoresposta e o fixture talkx-window-cases.json.

CREATE OR REPLACE FUNCTION public.talkx_campaign_resume_precheck(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_connection_id uuid;
  v_conn_status   text;
  v_conn_ok       boolean;
  v_window_open   boolean;
  v_blocked       integer;
  v_blockers      text[] := ARRAY[]::text[];
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  SELECT c.whatsapp_connection_id INTO v_connection_id
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Conexao ausente, inexistente ou diferente de `connected` bloqueia (fecha, nunca abre).
  SELECT w.status INTO v_conn_status
    FROM public.whatsapp_connections AS w
   WHERE w.id = v_connection_id;
  v_conn_ok := COALESCE(v_conn_status = 'connected', false);

  v_window_open := public.talkx_engine_window_open(p_campaign_id);

  SELECT count(*)::integer INTO v_blocked
    FROM public.talkx_recipients AS r
    JOIN public.contacts AS ct ON ct.id = r.contact_id
   WHERE r.campaign_id = p_campaign_id
     AND r.status = 'pending'
     AND EXISTS (
       SELECT 1 FROM public.talkx_blacklist AS bl
        WHERE bl.removed_at IS NULL
          AND (bl.expires_at IS NULL OR bl.expires_at > statement_timestamp())
          AND (bl.contact_id = ct.id
               OR (bl.phone IS NOT NULL
                   AND regexp_replace(bl.phone, '\D', '', 'g') = regexp_replace(ct.phone, '\D', '', 'g')))
     );

  IF NOT v_conn_ok THEN v_blockers := array_append(v_blockers, 'connection_not_connected'); END IF;
  IF NOT v_window_open THEN v_blockers := array_append(v_blockers, 'outside_send_window'); END IF;
  IF v_blocked > 0 THEN v_blockers := array_append(v_blockers, 'recipients_suppressed'); END IF;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'connection_status', v_conn_status,
    'connection_ok', v_conn_ok,
    'window_open', v_window_open,
    'suppressed_pending_recipients', v_blocked,
    'blockers', to_jsonb(v_blockers),
    'can_resume', cardinality(v_blockers) = 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_resume_precheck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_resume_precheck(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_resume_precheck(uuid) IS
  'N-097/X142: fatos da pre-checagem de retomada (conexao, janela, destinatarios suprimidos) + blockers + can_resume. Admin/supervisor ou service_role.';

-- Progresso por segmento, na ordem de envio (talkx_campaign_segments.position).
-- enviadas = sent+delivered; entregues = delivered; falhas = failed; restante = pending+sending.
-- status: done (restante 0), running (algum destinatario ja processado), pending (nenhum).
CREATE OR REPLACE FUNCTION public.talkx_campaign_segment_progress(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns AS c WHERE c.id = p_campaign_id) THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH counts AS (
    SELECT cs.position,
           cs.segment_id,
           COALESCE(s.name, '') AS name,
           count(r.id)::integer AS total,
           (count(r.id) FILTER (WHERE r.status IN ('sent', 'delivered')))::integer AS sent,
           (count(r.id) FILTER (WHERE r.status = 'delivered'))::integer AS delivered,
           (count(r.id) FILTER (WHERE r.status = 'failed'))::integer AS failed,
           (count(r.id) FILTER (WHERE r.status IN ('pending', 'sending')))::integer AS remaining
      FROM public.talkx_campaign_segments AS cs
      LEFT JOIN public.talkx_segments AS s ON s.id = cs.segment_id
      LEFT JOIN public.talkx_recipients AS r
             ON r.campaign_id = cs.campaign_id AND r.segment_id = cs.segment_id
     WHERE cs.campaign_id = p_campaign_id
     GROUP BY cs.position, cs.segment_id, s.name
  ), shaped AS (
    SELECT c.*,
           CASE WHEN c.total = 0 THEN 0
                ELSE round(100.0 * (c.total - c.remaining) / c.total)::integer END AS percent,
           CASE WHEN c.remaining = 0 THEN 'done'
                WHEN c.total - c.remaining > 0 THEN 'running'
                ELSE 'pending' END AS status
      FROM counts AS c
  )
  SELECT jsonb_build_object(
           'campaign_id', p_campaign_id,
           'total_segments', count(*)::integer,
           'pending_segments', (count(*) FILTER (WHERE status = 'pending'))::integer,
           'segments', COALESCE(jsonb_agg(jsonb_build_object(
             'position', position,
             'segment_id', segment_id,
             'name', name,
             'total', total,
             'sent', sent,
             'delivered', delivered,
             'failed', failed,
             'remaining', remaining,
             'percent', percent,
             'status', status
           ) ORDER BY position), '[]'::jsonb))
    INTO v_result
    FROM shaped;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_segment_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_segment_progress(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_segment_progress(uuid) IS
  'N-097/X142: progresso por segmento na ordem de envio (total, enviadas, entregues, falhas, restante, percent, status) + pending_segments/total_segments. Admin/supervisor ou service_role.';
