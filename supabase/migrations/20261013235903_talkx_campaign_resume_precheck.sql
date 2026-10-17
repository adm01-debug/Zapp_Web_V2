-- talkx_campaign_resume_precheck
--
-- Rollback: a RPC de progresso por segmento volta com a definicao
-- ANTERIOR COMPLETA (a de supabase/migrations/20261012115900_talkx_campaign_segment_progress.sql,
-- que e identica a desta migration) mais a ACL e o COMMENT de antes; a RPC nova desta
-- migration (talkx_campaign_resume_precheck) e dropada. Rodado inteiro, o bloco deixa o banco
-- exatamente como estava antes desta migration.
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.talkx_campaign_segment_progress(p_campaign_id uuid)
--   RETURNS TABLE(
--     segment_id uuid,
--     "position" smallint,
--     total bigint,
--     sent bigint,
--     delivered bigint,
--     failed bigint,
--     remaining bigint,
--     percent numeric,
--     status text,
--     total_segments bigint,
--     pending_segments bigint
--   )
--   LANGUAGE plpgsql
--   STABLE
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $function$
--   BEGIN
--     IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
--       RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
--     END IF;
--   
--     RETURN QUERY
--     WITH agg AS (
--       SELECT s.segment_id AS seg_id,
--              s."position" AS pos,
--              count(r.id) AS total,
--              count(r.id) FILTER (WHERE r.status IN ('sent', 'delivered')) AS sent,
--              count(r.id) FILTER (WHERE r.status = 'delivered') AS delivered,
--              count(r.id) FILTER (WHERE r.status = 'failed') AS failed,
--              count(r.id) FILTER (WHERE r.status IN ('pending', 'sending')) AS remaining
--         FROM public.talkx_campaign_segments s
--         LEFT JOIN public.talkx_recipients r
--           ON r.campaign_id = s.campaign_id AND r.segment_id = s.segment_id
--        WHERE s.campaign_id = p_campaign_id
--        GROUP BY s.segment_id, s."position"
--     ), st AS (
--       SELECT a.*,
--              CASE
--                WHEN a.total > 0 AND a.remaining = 0 THEN 'done'
--                WHEN a.total - a.remaining > 0 THEN 'running'
--                ELSE 'pending'
--              END AS seg_status
--         FROM agg a
--     )
--     SELECT st.seg_id,
--            st.pos,
--            st.total,
--            st.sent,
--            st.delivered,
--            st.failed,
--            st.remaining,
--            CASE WHEN st.total = 0 THEN 0::numeric
--                 ELSE round(100.0 * (st.total - st.remaining) / st.total, 1) END,
--            st.seg_status,
--            count(*) OVER (),
--            count(*) FILTER (WHERE st.seg_status <> 'done') OVER ()
--       FROM st
--      ORDER BY st.pos;
--   END;
--   $function$;
--   
--   REVOKE ALL ON FUNCTION public.talkx_campaign_segment_progress(uuid) FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.talkx_campaign_segment_progress(uuid) TO authenticated, service_role;
--   
--   COMMENT ON FUNCTION public.talkx_campaign_segment_progress(uuid) IS
--     'N-096/X142: progresso por segmento na ordem de envio (total, enviadas, entregues, falhas, restante, percentual, status done/running/pending, total_segments, pending_segments). So admin/supervisor ou service_role (42501 talkx_admin_required).';
--   drop function if exists public.talkx_campaign_resume_precheck(uuid);
-- N-097 / X142 (parte): pre-checagem de retomada no SERVIDOR. Funcao nova, de leitura
-- (STABLE), aditiva: nada existente e alterado. Antes de retomar uma campanha pausada, o
-- banco confere (1) a conexao WhatsApp da campanha, (2) a janela de envio agora e
-- (3) os destinatarios pendentes suprimidos (talkx_blacklist ativa por contato ou telefone,
-- mesmo criterio de talkx_audience_*). NAO decide a retomada: devolve os fatos e `blockers`;
-- `can_resume` = nenhum bloqueio. Escopo: admin/supervisor ou service_role (como X033).
--
-- A segunda funcao deste arquivo (talkx_campaign_segment_progress, N-096/X142) vai com o
-- CONTRATO JA EXISTENTE: assinatura e definicao COPIADAS de
-- supabase/migrations/20261012115900_talkx_campaign_segment_progress.sql, que ja esta na pilha
-- do dia (o marcador interno daquela RPC continua no arquivo de N-096: quem a INTRODUZ e ele;
-- este arquivo apenas repete a definicao vigente, porque a ponta do dia ainda nao trouxe a de
-- N-096). A versao anterior desta migration devolvia jsonb e, empilhada depois daquela,
-- abortava o conjunto inteiro: o CREATE da versao antiga terminava na linha 157 do arquivo e o
-- aplicador parou ali com "psql:<stdin>:157: ERROR: cannot change return type of existing
-- function" (create or replace nao muda tipo de retorno). O consumidor e o front X149
-- (src/components/talkx/tracking/talkxSegmentProgress.ts), que le LINHAS: o front nao inventa
-- campo que o servidor nao devolve. Repetir a definicao vigente mantem o comportamento ja
-- provado por scripts/db-audit/talkx-segment-progress.test.sh (N-096, no db-guard).
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

-- Progresso por segmento, na ordem de envio (talkx_campaign_segments.position) — N-096/X142.
-- Contrato ALINHADO com o que ja existe (20261012115900): devolve LINHAS, nao jsonb.
-- Por segmento (talkx_campaign_segments.position): total, enviadas (sent+delivered),
-- entregues, falhas, restante (pending+sending), percentual processado e status
-- (status: done = total > 0 e restante 0;
--  running = ha processados (total - restante) > 0 e ainda sobra restante;
--  pending = nada processado)
-- mais total_segments e pending_segments (segmentos ainda nao 'done') em cada linha.
-- Leitura pura, sem telefone/texto. Autorizacao igual a do helper irmao
-- talkx_engine_cron_runs: admin/supervisor ou service_role (42501 talkx_admin_required).

CREATE OR REPLACE FUNCTION public.talkx_campaign_segment_progress(p_campaign_id uuid)
RETURNS TABLE(
  segment_id uuid,
  "position" smallint,
  total bigint,
  sent bigint,
  delivered bigint,
  failed bigint,
  remaining bigint,
  percent numeric,
  status text,
  total_segments bigint,
  pending_segments bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT s.segment_id AS seg_id,
           s."position" AS pos,
           count(r.id) AS total,
           count(r.id) FILTER (WHERE r.status IN ('sent', 'delivered')) AS sent,
           count(r.id) FILTER (WHERE r.status = 'delivered') AS delivered,
           count(r.id) FILTER (WHERE r.status = 'failed') AS failed,
           count(r.id) FILTER (WHERE r.status IN ('pending', 'sending')) AS remaining
      FROM public.talkx_campaign_segments s
      LEFT JOIN public.talkx_recipients r
        ON r.campaign_id = s.campaign_id AND r.segment_id = s.segment_id
     WHERE s.campaign_id = p_campaign_id
     GROUP BY s.segment_id, s."position"
  ), st AS (
    SELECT a.*,
           CASE
             WHEN a.total > 0 AND a.remaining = 0 THEN 'done'
             WHEN a.total - a.remaining > 0 THEN 'running'
             ELSE 'pending'
           END AS seg_status
      FROM agg a
  )
  SELECT st.seg_id,
         st.pos,
         st.total,
         st.sent,
         st.delivered,
         st.failed,
         st.remaining,
         CASE WHEN st.total = 0 THEN 0::numeric
              ELSE round(100.0 * (st.total - st.remaining) / st.total, 1) END,
         st.seg_status,
         count(*) OVER (),
         count(*) FILTER (WHERE st.seg_status <> 'done') OVER ()
    FROM st
   ORDER BY st.pos;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_segment_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_segment_progress(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_segment_progress(uuid) IS
  'N-096/X142: progresso por segmento na ordem de envio (total, enviadas, entregues, falhas, restante, percentual, status done/running/pending, total_segments, pending_segments). So admin/supervisor ou service_role (42501 talkx_admin_required).';
