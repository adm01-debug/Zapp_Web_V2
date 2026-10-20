-- talkx_log_por_destinatario_saude_e_alertas
-- versão 20261003242707 reservada para hermes-talkx-log-saude-alertas-26100400174c40 (hermes-db-migrar --nova)
-- rollback: 1) recriar public.trigger_talkx_engine_tick() com o corpo vivo de 20261003232707 (sem a chamada a talkx_engine_alerts); 2) recriar public.purge_talkx_expired_data(integer) com o corpo vivo de 20261003232707 (sem o expurgo de talkx_delivery_log); 3) DROP VIEW IF EXISTS public.talkx_engine_health; 4) DROP FUNCTION IF EXISTS public.talkx_engine_alerts(); DROP FUNCTION IF EXISTS public.talkx_engine_cron_runs(integer); DROP FUNCTION IF EXISTS public.talkx_engine_window_open(uuid); DROP FUNCTION IF EXISTS public.talkx_campaign_logs(uuid, timestamptz, integer); 5) DROP TABLE IF EXISTS public.talkx_alerts; DROP TABLE IF EXISTS public.talkx_delivery_log;
--
-- X033 (Fase 3 · Tela 12/14 · camada banco + edge + cron · DDL). Fecha CAP-100, CAP-101.
-- Exige X012, X019, X032 (todas mergeadas).
--
-- HOJE: o Logger da edge grava fn/rid/ms sem campanha, destinatario ou tentativa; nao existe
-- log por destinatario persistido (o resultado de cada envio morre no console/na timeline);
-- nao existe visao de saude do motor nem alerta (o resultado do cron so existe em
-- cron.job_run_details e net._http_response).
--
-- FAZER (esta migration):
--   (a) tabela public.talkx_delivery_log(id, campaign_id, recipient_id, attempt, stage, outcome,
--       http_status, error_code, worker_id, duration_ms, created_at) — escrita service_role,
--       leitura admin/supervisor, SEM telefone nem texto de mensagem, expurgo de 30 dias pelo
--       purge_talkx_expired_data; indices por campanha e por data;
--   (b) RPC public.talkx_campaign_logs(p_campaign_id, p_after, p_limit) — leitura paginada do
--       log de uma campanha (admin/supervisor);
--   (c) view public.talkx_engine_health (security_invoker) com os sinais de saude: campanha
--       'sending' sem envio novo ha mais de 15 min com a janela aberta, destinatario 'sending'
--       com lease vencido, outcome_unknown em 24 h, taxa de falha em 15 min e as ultimas 60
--       execucoes do cron do Talk X (status + return_message);
--   (d) tabela public.talkx_alerts(kind, campaign_id, payload, opened_at, resolved_at) e funcao
--       public.talkx_engine_alerts() — chamada pelo tick A CADA 5 MIN — que abre um alerta por
--       (tipo, campanha) sem duplicar e fecha automaticamente o que deixou de disparar.
--
-- REGRA DE RECONSTRUCAO: os corpos de public.purge_talkx_expired_data(integer) e
-- public.trigger_talkx_engine_tick() foram COPIADOS VIVOS da migration mais recente de cada um
-- (20261003232707_talkx_lgpd_consentimento_expurgo.sql) e SO o delta do X033 foi aplicado
-- (o expurgo de 30 dias do log de entrega e a chamada de 5 em 5 min aos alertas). Nada da logica
-- de retencao existente nem do fan-out/conclusao/tick foi reescrito.
--
-- Classe: CONTRATO (CREATE TABLE + CREATE FUNCTION + CREATE VIEW + ACL). Idempotente/replayavel:
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- O para-choque do expurgo entra sem DROP COLUMN, entao vale no mesmo dia do deploy da edge.

-- ============================================================================
-- (a) log por destinatario
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.talkx_delivery_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE CASCADE,
  attempt      integer NOT NULL DEFAULT 1,
  stage        text NOT NULL,
  outcome      text NOT NULL,
  http_status  integer,
  error_code   text,
  worker_id    text,
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_delivery_log_attempt_check CHECK (attempt >= 0),
  CONSTRAINT talkx_delivery_log_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT talkx_delivery_log_http_status_check CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT talkx_delivery_log_stage_check CHECK (stage IN ('claim', 'suppress_check', 'dispatch', 'complete', 'reconcile')),
  CONSTRAINT talkx_delivery_log_outcome_check CHECK (outcome IN ('sent', 'failed', 'outcome_unknown', 'skipped', 'rescheduled', 'no_claim', 'stopped'))
);

COMMENT ON TABLE public.talkx_delivery_log IS
  'X033: log por destinatario do motor Talk X (etapa/tentativa/resultado/duracao). SEM telefone e SEM texto de mensagem — so ids, codigos e metricas. Escrita service_role (edge talkx-send), leitura admin/supervisor; expurgo de 30 dias pelo purge_talkx_expired_data.';
COMMENT ON COLUMN public.talkx_delivery_log.attempt IS
  'X033: ordinal da tentativa que produziu a linha (1 = primeiro envio ao provedor).';

CREATE INDEX IF NOT EXISTS talkx_delivery_log_campaign_created_idx
  ON public.talkx_delivery_log (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talkx_delivery_log_created_idx
  ON public.talkx_delivery_log (created_at);
CREATE INDEX IF NOT EXISTS talkx_delivery_log_recipient_idx
  ON public.talkx_delivery_log (recipient_id, created_at DESC);

ALTER TABLE public.talkx_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talkx_delivery_log_select ON public.talkx_delivery_log;
CREATE POLICY talkx_delivery_log_select
  ON public.talkx_delivery_log FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

REVOKE ALL ON public.talkx_delivery_log FROM PUBLIC, anon;
GRANT SELECT ON public.talkx_delivery_log TO authenticated;
GRANT ALL ON public.talkx_delivery_log TO service_role;

-- ============================================================================
-- (b) RPC de leitura paginada do log de uma campanha
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_campaign_logs(
  p_campaign_id uuid,
  p_after timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  campaign_id uuid,
  recipient_id uuid,
  attempt integer,
  stage text,
  outcome text,
  http_status integer,
  error_code text,
  worker_id text,
  duration_ms integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limit integer;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);

  RETURN QUERY
    SELECT l.id, l.campaign_id, l.recipient_id, l.attempt, l.stage, l.outcome,
           l.http_status, l.error_code, l.worker_id, l.duration_ms, l.created_at
      FROM public.talkx_delivery_log AS l
     WHERE l.campaign_id = p_campaign_id
       AND (p_after IS NULL OR l.created_at > p_after)
     ORDER BY l.created_at, l.id
     LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer) IS
  'X033: leitura paginada do talkx_delivery_log de uma campanha (admin/supervisor). p_after = cursor por created_at; p_limit 1..1000.';

-- ============================================================================
-- (c1) janela de entrega aberta agora (mesma semantica do talkx-window.ts)
-- ============================================================================
-- Espelha deliveryWindowStatus(): fuso da campanha, send_window_start/end e, quando
-- business_hours_only, o business_hours de talkx_settings (start/end/days). Entrada
-- malformada fecha (recusa) — nunca falha aberta.
CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tz         text;
  v_start      time;
  v_end        time;
  v_bh_only    boolean;
  v_local      timestamp;
  v_min        integer;
  v_bh         jsonb;
  v_days       jsonb;
  v_bstart     text;
  v_bend       text;
  v_bstart_min integer;
  v_bend_min   integer;
  v_dow        integer;
BEGIN
  SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'),
         c.send_window_start,
         c.send_window_end,
         COALESCE(c.business_hours_only, false)
    INTO v_tz, v_start, v_end, v_bh_only
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_local := (now() AT TIME ZONE v_tz);
  v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
       OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN
      RETURN false;
    END IF;
  END IF;

  IF v_bh_only THEN
    SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';
    v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
    v_bstart := COALESCE(v_bh ->> 'start', '08:00');
    v_bend := COALESCE(v_bh ->> 'end', '18:00');
    v_dow := EXTRACT(dow FROM v_local)::integer;
    IF NOT (v_days @> to_jsonb(v_dow)) THEN
      RETURN false;
    END IF;
    v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer;
    v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer;
    IF v_min < v_bstart_min OR v_min >= v_bend_min THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_window_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_engine_window_open(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_engine_window_open(uuid) IS
  'X033: a janela de entrega da campanha esta aberta agora? Mesma semantica de deliveryWindowStatus() (fuso, send_window_*, business_hours). Fecha em entrada invalida.';

-- ============================================================================
-- (c2) ultimas execucoes do cron do Talk X (guardado: pg_cron pode nao existir)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs(p_limit integer DEFAULT 60)
RETURNS TABLE(
  runid bigint,
  jobid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_jobid bigint;
  v_limit integer;
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''talkx-scheduler-1min'' LIMIT 1' INTO v_jobid;
  END IF;
  IF v_jobid IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT runid, jobid, status, return_message, start_time, end_time
       FROM cron.job_run_details
      WHERE jobid = %L
      ORDER BY start_time DESC NULLS LAST, runid DESC
      LIMIT %s', v_jobid, v_limit);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_cron_runs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_engine_cron_runs(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_engine_cron_runs(integer) IS
  'X033: ultimas N execucoes do job cron talkx-scheduler-1min (status + return_message). Devolve vazio quando pg_cron/cron.job_run_details nao existem (Postgres descartavel).';

-- ============================================================================
-- (c3) view de saude do motor
-- ============================================================================
-- security_invoker = true: a leitura passa pela RLS de quem consulta. Os sinais de
-- campanha/destinatario vem das tabelas talkx (RLS do modulo); o ramo do cron e
-- guardado por papel (service_role ou admin/supervisor) porque le cron.job_run_details.
CREATE OR REPLACE VIEW public.talkx_engine_health
WITH (security_invoker = true) AS
WITH sending_activity AS (
  SELECT c.id AS campaign_id,
         COALESCE(
           (SELECT max(r.sent_at)
              FROM public.talkx_recipients AS r
             WHERE r.campaign_id = c.id AND r.sent_at IS NOT NULL),
           c.started_at,
           c.updated_at
         ) AS last_activity_at
    FROM public.talkx_campaigns AS c
   WHERE c.status = 'sending'
)
SELECT 'stalled_campaign'::text AS kind,
       a.campaign_id,
       NULL::uuid AS recipient_id,
       NULL::text AS status,
       NULL::text AS return_message,
       NULL::bigint AS metric_count,
       NULL::numeric AS metric_rate,
       jsonb_build_object(
         'last_activity_at', a.last_activity_at,
         'stalled_minutes', floor(EXTRACT(epoch FROM (now() - a.last_activity_at)) / 60)::integer
       ) AS detail,
       a.last_activity_at AS observed_at
  FROM sending_activity AS a
 WHERE a.last_activity_at < now() - interval '15 minutes'
   AND public.talkx_engine_window_open(a.campaign_id)
UNION ALL
SELECT 'stale_lease'::text, r.campaign_id, r.id, r.status, NULL, NULL, NULL,
       jsonb_build_object('delivery_claim_expires_at', r.delivery_claim_expires_at),
       r.delivery_claim_expires_at
  FROM public.talkx_recipients AS r
 WHERE r.status = 'sending'
   AND r.delivery_claim_expires_at IS NOT NULL
   AND r.delivery_claim_expires_at < now()
UNION ALL
SELECT 'outcome_unknown_24h'::text, r.campaign_id, NULL, NULL, NULL, count(*)::bigint, NULL,
       jsonb_build_object('window_hours', 24), now()
  FROM public.talkx_recipients AS r
 WHERE r.status = 'outcome_unknown'
   AND r.updated_at >= now() - interval '24 hours'
 GROUP BY r.campaign_id
UNION ALL
SELECT 'failure_rate_15m'::text, r.campaign_id, NULL, NULL, NULL,
       count(*) FILTER (WHERE r.status = 'failed')::bigint,
       round(count(*) FILTER (WHERE r.status = 'failed')::numeric / NULLIF(count(*), 0), 4),
       jsonb_build_object('window_minutes', 15), now()
  FROM public.talkx_recipients AS r
 WHERE r.updated_at >= now() - interval '15 minutes'
   AND r.status IN ('sent', 'delivered', 'failed', 'outcome_unknown')
 GROUP BY r.campaign_id
UNION ALL
SELECT 'cron_run'::text, NULL, NULL, cr.status, cr.return_message, NULL, NULL,
       jsonb_build_object('runid', cr.runid, 'jobid', cr.jobid,
                          'start_time', cr.start_time, 'end_time', cr.end_time),
       cr.start_time
  FROM public.talkx_engine_cron_runs(60) AS cr
 WHERE (COALESCE(auth.role(), '') = 'service_role' OR public.is_admin_or_supervisor(auth.uid()));

REVOKE ALL ON public.talkx_engine_health FROM PUBLIC, anon;
GRANT SELECT ON public.talkx_engine_health TO authenticated, service_role;

COMMENT ON VIEW public.talkx_engine_health IS
  'X033: saude do motor Talk X (security_invoker). Sinais: stalled_campaign (sending sem envio novo >15min com janela aberta), stale_lease (destinatario sending com lease vencido), outcome_unknown_24h, failure_rate_15m e cron_run (ultimas 60 execucoes do cron do Talk X com status/return_message).';

-- ============================================================================
-- (d1) tabela de alertas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.talkx_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT talkx_alerts_kind_check CHECK (kind IN
    ('stalled_campaign', 'stale_lease', 'outcome_unknown', 'high_failure_rate', 'cron_degraded'))
);

-- Deduplicacao por (tipo, campanha) enquanto o alerta esta aberto. COALESCE para que
-- os alertas globais (campaign_id nulo, ex.: cron_degraded) tambem dedupliquem.
CREATE UNIQUE INDEX IF NOT EXISTS talkx_alerts_open_dedup
  ON public.talkx_alerts (kind, COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS talkx_alerts_campaign_idx
  ON public.talkx_alerts (campaign_id, opened_at DESC);

ALTER TABLE public.talkx_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talkx_alerts_select ON public.talkx_alerts;
CREATE POLICY talkx_alerts_select
  ON public.talkx_alerts FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

REVOKE ALL ON public.talkx_alerts FROM PUBLIC, anon;
GRANT SELECT ON public.talkx_alerts TO authenticated;
GRANT ALL ON public.talkx_alerts TO service_role;

COMMENT ON TABLE public.talkx_alerts IS
  'X033: alertas do motor Talk X. Um alerta aberto por (tipo, campanha); fechado sozinho quando o sinal deixa de disparar (resolved_at). Escrito por talkx_engine_alerts (service_role), lido por admin/supervisor.';

-- ============================================================================
-- (d2) talkx_engine_alerts() — abre/fecha alertas a partir da visao de saude
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_engine_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_firing   jsonb := '[]'::jsonb;
  v_opened   integer := 0;
  v_resolved integer := 0;
  v_cron_bad boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- Sinais que disparam alerta AGORA (kind de alerta + campanha).
  WITH signals AS (
    SELECT h.kind, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind IN ('stalled_campaign', 'outcome_unknown_24h')
    UNION
    SELECT 'stale_lease'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'stale_lease'
    UNION
    SELECT 'high_failure_rate'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'failure_rate_15m'
       AND COALESCE(h.metric_count, 0) >= 5
       AND COALESCE(h.metric_rate, 0) >= 0.5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'campaign_id', s.campaign_id)), '[]'::jsonb)
    INTO v_firing
    FROM signals AS s;

  -- cron_degraded: ultimas 3 execucoes do cron do Talk X todas falhas (ex.: job startup timeout).
  SELECT (count(*) = 3 AND bool_and(r.status = 'failed'))
    INTO v_cron_bad
    FROM (
      SELECT cr.status
        FROM public.talkx_engine_cron_runs(3) AS cr
       ORDER BY cr.start_time DESC NULLS LAST, cr.runid DESC
       LIMIT 3
    ) AS r;
  IF COALESCE(v_cron_bad, false) THEN
    v_firing := v_firing || jsonb_build_array(jsonb_build_object('kind', 'cron_degraded', 'campaign_id', NULL));
  END IF;

  -- 1) abrir alertas novos (dedup pelo indice parcial unico; ON CONFLICT DO NOTHING).
  INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
  SELECT (s ->> 'kind'),
         NULLIF(s ->> 'campaign_id', '')::uuid,
         jsonb_build_object('detected_at', v_now, 'source', 'talkx_engine_health')
    FROM jsonb_array_elements(v_firing) AS s
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- 2) fechar alertas cujo sinal deixou de disparar (fechamento automatico).
  UPDATE public.talkx_alerts AS a
     SET resolved_at = v_now
   WHERE a.resolved_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_firing) AS s
        WHERE (s ->> 'kind') = a.kind
          AND COALESCE(NULLIF(s ->> 'campaign_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(a.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
     );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN jsonb_build_object(
    'opened', v_opened,
    'resolved', v_resolved,
    'firing', v_firing,
    'at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_engine_alerts() TO service_role;

COMMENT ON FUNCTION public.talkx_engine_alerts() IS
  'X033: avalia talkx_engine_health e abre/fecha talkx_alerts. Dedup por (tipo, campanha); fecha sozinho o alerta que parou de disparar. Chamada pelo trigger_talkx_engine_tick a cada 5 min. So service_role.';

-- ============================================================================
-- (e) expurgo LGPD do log de entrega (corpo vivo 20261003232707 + delta X033)
-- ============================================================================
-- Uma vez por dia (controle em talkx_settings.last_purge_at, dia de calendario em
-- America/Sao_Paulo): na segunda execucao do mesmo dia devolve contagens zeradas sem tocar
-- em nada. Nunca apaga talkx_blacklist, contadores nem eventos.
CREATE OR REPLACE FUNCTION public.purge_talkx_expired_data(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_days_message integer;
  v_days_clicks  integer;
  v_days_test    integer;
  v_days_ai      integer;
  v_now          timestamptz := statement_timestamp();
  v_last         timestamptz;
  v_msg          integer := 0;
  v_clicks       integer := 0;
  v_test         integer := 0;
  v_ai           integer := 0;
  v_media        integer := 0;
  v_log          integer := 0;
  v_events       integer := 0;
  v_entity_id    uuid := gen_random_uuid();
  v_counts       jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'invalid_talkx_purge_limit' USING ERRCODE = '22023';
  END IF;

  SELECT (settings.value #>> '{}')::timestamptz
    INTO v_last
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'last_purge_at';

  -- Gate diario: se o ultimo expurgo foi hoje (America/Sao_Paulo), nao roda de novo.
  IF v_last IS NOT NULL
     AND (v_last AT TIME ZONE 'America/Sao_Paulo')::date
         = (v_now AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object(
      'skipped', true, 'messages', 0, 'clicks', 0, 'test_sends', 0, 'ai', 0, 'media', 0, 'delivery_log', 0
    );
  END IF;

  SELECT (settings.value #>> '{}')::integer INTO v_days_message
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_message';
  SELECT (settings.value #>> '{}')::integer INTO v_days_clicks
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_clicks';
  SELECT (settings.value #>> '{}')::integer INTO v_days_test
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_test_sends';
  SELECT (settings.value #>> '{}')::integer INTO v_days_ai
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_ai';
  v_days_message := COALESCE(v_days_message, 180);
  v_days_clicks  := COALESCE(v_days_clicks, 365);
  v_days_test    := COALESCE(v_days_test, 90);
  v_days_ai      := COALESCE(v_days_ai, 90);

  -- 1) texto e snapshots de midia dos destinatarios de campanhas TERMINAIS vencidas
  WITH terminal AS (
    SELECT recipient.id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.status IN ('completed', 'cancelled')
       AND COALESCE(campaign.completed_at, campaign.cancelled_at, campaign.updated_at)
           < v_now - make_interval(days => v_days_message)
       AND (recipient.personalized_message IS NOT NULL
            OR recipient.media_url_snapshot IS NOT NULL
            OR recipient.media_type_snapshot IS NOT NULL)
     ORDER BY recipient.id
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  )
  UPDATE public.talkx_recipients AS recipient
     SET personalized_message = NULL,
         media_url_snapshot = NULL,
         media_type_snapshot = NULL,
         updated_at = v_now
    FROM terminal
   WHERE recipient.id = terminal.id;
  GET DIAGNOSTICS v_msg = ROW_COUNT;

  -- 2) ua/ip_hash de cliques vencidos
  WITH vencidos AS (
    SELECT click.id
      FROM public.talkx_link_clicks AS click
     WHERE click.clicked_at < v_now - make_interval(days => v_days_clicks)
       AND (click.ua IS NOT NULL OR click.ip_hash IS NOT NULL)
     ORDER BY click.id
     LIMIT p_limit
     FOR UPDATE OF click SKIP LOCKED
  )
  UPDATE public.talkx_link_clicks AS click
     SET ua = NULL,
         ip_hash = NULL
    FROM vencidos
   WHERE click.id = vencidos.id;
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  -- 3) linhas vencidas de teste (envio de teste)
  IF to_regclass('public.talkx_test_send_claims') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT claim.id
        FROM public.talkx_test_send_claims AS claim
       WHERE claim.created_at < v_now - make_interval(days => v_days_test)
       ORDER BY claim.id
       LIMIT p_limit
    )
    DELETE FROM public.talkx_test_send_claims AS claim
     USING vencidos
     WHERE claim.id = vencidos.id;
    GET DIAGNOSTICS v_test = ROW_COUNT;
  END IF;

  -- 4) linhas vencidas de IA (jobs terminais antigos)
  IF to_regclass('public.ai_jobs') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT job.id
        FROM public.ai_jobs AS job
       WHERE job.status IN ('succeeded', 'failed', 'cancelled', 'outcome_unknown')
         AND COALESCE(job.finished_at, job.created_at) < v_now - make_interval(days => v_days_ai)
       ORDER BY job.id
       LIMIT p_limit
    )
    DELETE FROM public.ai_jobs AS job
     USING vencidos
     WHERE job.id = vencidos.id;
    GET DIAGNOSTICS v_ai = ROW_COUNT;
  END IF;

  -- 5) objetos de talkx-media sem referencia (bucket ainda pode nao existir; guarded).
  -- Referencia a storage.objects so aparece em SQL dinamico/EXECUTE para nao falhar o
  -- parse da funcao quando o schema storage nao existe (PostgreSQL descartavel).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE format($media$
      WITH orfaos AS (
        SELECT object.id
          FROM storage.objects AS object
         WHERE object.bucket_id = 'talkx-media'
           AND object.created_at < %L::timestamptz - make_interval(days => %s)
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_campaigns AS campaign
              WHERE campaign.media_url LIKE '%%/' || object.name
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_recipients AS recipient
              WHERE recipient.media_url_snapshot LIKE '%%/' || object.name
           )
         ORDER BY object.id
         LIMIT %s
      )
      DELETE FROM storage.objects AS object
       USING orfaos
       WHERE object.id = orfaos.id
    $media$, v_now, v_days_message, p_limit);
    GET DIAGNOSTICS v_media = ROW_COUNT;
  END IF;

  -- 6) X033: log de entrega por destinatario vencido (30 dias, prazo proprio do X033).
  WITH vencidos AS (
    SELECT log.id
      FROM public.talkx_delivery_log AS log
     WHERE log.created_at < v_now - interval '30 days'
     ORDER BY log.id
     LIMIT p_limit
  )
  DELETE FROM public.talkx_delivery_log AS log
   USING vencidos
   WHERE log.id = vencidos.id;
  GET DIAGNOSTICS v_log = ROW_COUNT;

  -- Marca o expurgo do dia ANTES do evento, para o gate valer mesmo se o INSERT falhar.
  INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at)
  VALUES ('last_purge_at', to_jsonb(v_now::text), 'X032: instante do ultimo expurgo.', v_now)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  v_counts := jsonb_build_object(
    'skipped', false,
    'messages', v_msg,
    'clicks', v_clicks,
    'test_sends', v_test,
    'ai', v_ai,
    'media', v_media,
    'delivery_log', v_log
  );

  -- Evento com as contagens (campanha nula => evento de entidade, respeita o target_check).
  INSERT INTO public.talkx_campaign_events
    (campaign_id, event_type, message, actor_id, entity_type, entity_id)
  VALUES (NULL, 'note', v_counts::text, NULL, 'talkx_lgpd_purge', v_entity_id);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN v_counts || jsonb_build_object('events', v_events);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_talkx_expired_data(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_talkx_expired_data(integer)
  TO service_role;

COMMENT ON FUNCTION public.purge_talkx_expired_data(integer) IS
  'Talk X (X032 + X033): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, de IA e (X033) do talkx_delivery_log acima de 30 dias, e objetos de talkx-media orfaos; grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- (f) tick do motor chama os alertas a cada 5 min (corpo vivo 20261003232707 + delta)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_talkx_engine_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_campaign_id      uuid;
  v_scheduler_url    text;
  v_anon_key         text;
  v_cron_secret      text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- X032: expurgo LGPD — a propria funcao se limita a 1x/dia (last_purge_at).
  PERFORM public.purge_talkx_expired_data(1000);

  -- X033: alertas do motor a cada 5 min (minutos 0,5,10,...). Best-effort: uma falha
  -- na avaliacao de saude nunca pode derrubar o fan-out do motor.
  IF EXTRACT(minute FROM now())::integer % 5 = 0 THEN
    BEGIN
      PERFORM public.talkx_engine_alerts();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 1) Fecha item preso (POST feito, lease expirado) ANTES de qualquer fan-out,
  --    senão a campanha nunca consegue drenar.
  PERFORM public.sweep_talkx_stuck_recipients(500);

  -- 2) Campanha 'sending' sem nenhum destinatário pendente/sending já drenou.
  FOR v_campaign_id IN
    SELECT campaign.id
      FROM public.talkx_campaigns AS campaign
     WHERE campaign.status = 'sending'
       AND NOT EXISTS (
         SELECT 1
           FROM public.talkx_recipients AS recipient
          WHERE recipient.campaign_id = campaign.id
            AND recipient.status IN ('pending', 'sending')
       )
     ORDER BY campaign.updated_at
  LOOP
    BEGIN
      PERFORM public.complete_talkx_campaign_if_drained(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      -- Uma campanha inválida não pode travar o tick.
      NULL;
    END;
  END LOOP;

  -- 3) Fan-out: no máximo UMA campanha 'sending' por conexão por tick (a de
  --    updated_at mais antigo), teto de 10 no tick. Antes, a edge podia levar
  --    N campanhas na MESMA instância — fan-out que derruba a sessão do WhatsApp.
  FOR v_campaign_id IN
    SELECT ranked.id
      FROM (
        SELECT campaign.id,
               row_number() OVER (
                 PARTITION BY COALESCE(campaign.whatsapp_connection_id::text, 'sem-conexao')
                 ORDER BY campaign.updated_at, campaign.id
               ) AS position
          FROM public.talkx_campaigns AS campaign
         WHERE campaign.status = 'sending'
      ) AS ranked
     WHERE ranked.position <= 1
     ORDER BY ranked.id
     LIMIT 10
  LOOP
    BEGIN
      PERFORM public.kick_talkx_campaign(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 4) Camada agendada: o talkx-scheduler resolve 'scheduled' e 'paused' dentro
  --    da janela. Mesmo segredo e mesmo timeout do kick.
  SELECT decrypted_secret INTO v_scheduler_url
    FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key' LIMIT 1;
  v_cron_secret := public.get_talkx_cron_secret();

  IF v_scheduler_url IS NOT NULL AND v_cron_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_scheduler_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_talkx_engine_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_talkx_engine_tick() TO service_role;

-- ============================================================================
-- Fail-closed: se qualquer objeto do contrato nao colar, aborta.
-- ============================================================================
DO $x033_guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_delivery_log'),
      ('public.talkx_alerts'),
      ('public.talkx_engine_health'),
      ('public.talkx_campaign_logs(uuid,timestamptz,integer)'),
      ('public.talkx_engine_alerts()'),
      ('public.talkx_engine_window_open(uuid)'),
      ('public.talkx_engine_cron_runs(integer)'),
      ('public.purge_talkx_expired_data(integer)'),
      ('public.trigger_talkx_engine_tick()')
  ) AS esperado(assinatura)
  WHERE to_regclass(assinatura) IS NULL
    AND to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x033_objetos_ausentes: %', v_missing;
  END IF;
END;
$x033_guard$;
