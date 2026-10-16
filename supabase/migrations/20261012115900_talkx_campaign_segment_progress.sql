-- talkx_campaign_segment_progress
-- Rollback: funcao nova, dropada no rollback; nenhum dado e alterado, nada a restaurar.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_campaign_segment_progress(uuid);
--
-- N-096 / X142 (parte 1): progresso da campanha por segmento, na ordem de envio.
-- Marcador interno: talkx_campaign_segment_progress
--
-- Por segmento (talkx_campaign_segments.position): total, enviadas (sent+delivered),
-- entregues, falhas, restante (pending+sending), percentual processado e status
--   done    = total > 0 e restante 0
--   running = ha processados (total - restante) > 0 e ainda sobra restante
--   pending = nada processado
-- mais total_segments e pending_segments (segmentos ainda nao 'done') em cada linha.
-- Leitura pura, sem telefone/texto. Autorizacao igual a do helper irmao
-- talkx_engine_cron_runs: admin/supervisor ou service_role (42501 talkx_admin_required).
-- A pre-checagem de retomada (talkx_campaign_resume_precheck) NAO faz parte deste passo.

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
