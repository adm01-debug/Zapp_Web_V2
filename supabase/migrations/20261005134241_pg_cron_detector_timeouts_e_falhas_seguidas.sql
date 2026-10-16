-- pg_cron_detector_timeouts_e_falhas_seguidas
-- Rollback: recriar public.talkx_engine_alerts() com o corpo de
-- 20261004173439_talkx_tick_nao_aborta_no_expurgo.sql (regra antiga: as 3 ultimas
-- execucoes todas falhas). E o unico objeto tocado por esta migration; nenhum
-- alerta precisa ser apagado (o fechamento automatico cuida dos abertos).
--
-- P2 #119 (M-DB-06): em 03/10 o pg_cron registrou 'job startup timeout' em massa
-- (~2.006). O detector cron_degraded do sensor (talkx_engine_alerts, chamado pelo
-- tick a cada 5 min) so olhava as ultimas 3 execucoes, exigia as 3 falhas e nao
-- lia return_message: nao enxergava a assinatura do evento nem contava falhas
-- seguidas.
--
-- CAUSA (ja identificada em docs/ops/runbook-pg-cron-capacidade.md, secoes
-- 2.2-2.4): 'job startup timeout' = exaustao de backends (max_worker_processes=6
-- vs cron.max_running_jobs=32 + 3 jobs de cadencia de 1 min). A mitigacao de
-- pico ja foi aplicada por 20261002541230_pg_cron_escalonar_jobs.sql (offsets de
-- minuto; maximo de jobs no mesmo minuto 10 -> 7). Esta migration NAO mexe em
-- agendamento nem em capacidade: so melhora o detector.
--
-- REGRA NOVA de cron_degraded (ultimas 10 execucoes de cron.job_run_details do
-- job talkx-scheduler-1min, via talkx_engine_cron_runs, so status/return_message):
--   (a) >=5 execucoes consecutivas com status='failed' (contadas da mais recente
--       para tras), OU
--   (b) a execucao mais recente falhou com return_message contendo 'job startup
--       timeout' -- 1 timeout ja indica o banco sem backend livre; nao espera
--       5 falhas.
-- Fecha sozinho quando nenhuma vale (mesmo fechamento automatico de antes).
-- Payload do alerta: detected_at, source, reason ('timeout' | 'consecutive_failures'),
-- consecutive_failures, timeouts (quantas das 10 sao startup timeout),
-- last_return_message (truncado em 200). Alerta ja aberto e atualizado por
-- ON CONFLICT ... DO UPDATE (mesmo padrao do purge_failed) com a contagem corrente.
--
-- REGRA DE RECONSTRUCAO: corpo copiado vivo de 20261004173439 (M-DB-01); so o
-- detector de cron mudou. Idempotente/replayavel: so CREATE OR REPLACE.

-- ============================================================================
-- talkx_engine_alerts(): detector de cron com timeouts e falhas seguidas
-- (corpo vivo de 20261004173439 + delta do cron_degraded)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_engine_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now                 timestamptz := now();
  v_firing              jsonb := '[]'::jsonb;
  v_opened              integer := 0;
  v_resolved            integer := 0;
  v_cron_bad            boolean := false;
  v_cron_reason         text;
  v_cron_consec         integer := 0;
  v_cron_timeouts       integer := 0;
  v_cron_last_msg       text;
  v_cron_timeout_latest boolean := false;
  v_cron_already_open   boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- Sinais que disparam alerta AGORA (kind de alerta + campanha).
  -- M-DB-01: a view emite 'outcome_unknown_24h'; o kind do alerta (CHECK) e 'outcome_unknown'.
  WITH signals AS (
    SELECT CASE WHEN h.kind = 'outcome_unknown_24h' THEN 'outcome_unknown' ELSE h.kind END AS kind,
           h.campaign_id
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

  -- cron_degraded (P2 #119): ultimas 10 execucoes do cron do Talk X. Abre quando
  -- (a) ha >=5 falhas consecutivas (status='failed', da mais recente para tras)
  -- OU (b) a mais recente falhou com 'job startup timeout' (exaustao de backends;
  -- runbook-pg-cron-capacidade.md). Antes so disparava com 3 seguidas e nao
  -- distinguia timeout de falha do proprio job.
  WITH last10 AS (
    SELECT cr.status, cr.return_message,
           row_number() OVER (ORDER BY cr.start_time DESC NULLS LAST, cr.runid DESC) AS rn
      FROM public.talkx_engine_cron_runs(10) AS cr
  )
  SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE COALESCE(min(l.rn) FILTER (WHERE l.status IS DISTINCT FROM 'failed'),
                            count(*) + 1) - 1
         END,
         count(*) FILTER (WHERE l.return_message ILIKE '%job startup timeout%'),
         max(l.return_message) FILTER (WHERE l.rn = 1),
         COALESCE(bool_or(l.rn = 1 AND l.status = 'failed'
                          AND l.return_message ILIKE '%job startup timeout%'), false)
    INTO v_cron_consec, v_cron_timeouts, v_cron_last_msg, v_cron_timeout_latest
    FROM last10 AS l;

  IF v_cron_timeout_latest THEN
    v_cron_bad := true;
    v_cron_reason := 'timeout';
  ELSIF v_cron_consec >= 5 THEN
    v_cron_bad := true;
    v_cron_reason := 'consecutive_failures';
  END IF;

  IF v_cron_bad THEN
    v_firing := v_firing || jsonb_build_array(jsonb_build_object('kind', 'cron_degraded', 'campaign_id', NULL));
  END IF;

  -- 1) abrir alertas novos (dedup pelo indice parcial unico; ON CONFLICT DO NOTHING).
  --    cron_degraded fica fora: entra no upsert abaixo, o payload muda a cada avaliacao.
  INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
  SELECT (s ->> 'kind'),
         NULLIF(s ->> 'campaign_id', '')::uuid,
         jsonb_build_object('detected_at', v_now, 'source', 'talkx_engine_health')
    FROM jsonb_array_elements(v_firing) AS s
   WHERE (s ->> 'kind') <> 'cron_degraded'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- 1b) cron_degraded: abre ou, se ja houver um aberto, atualiza o payload com a
  --     contagem corrente (mesmo padrao ON CONFLICT ... DO UPDATE do purge_failed
  --     no tick; detected_at do primeiro disparo e preservado).
  IF v_cron_bad THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.talkx_alerts AS a
       WHERE a.kind = 'cron_degraded'
         AND a.resolved_at IS NULL
    ) INTO v_cron_already_open;

    INSERT INTO public.talkx_alerts AS alert (kind, campaign_id, payload)
    VALUES ('cron_degraded', NULL, jsonb_build_object(
      'detected_at', v_now,
      'source', 'talkx_engine_health',
      'reason', v_cron_reason,
      'consecutive_failures', v_cron_consec,
      'timeouts', v_cron_timeouts,
      'last_return_message', left(v_cron_last_msg, 200)
    ))
    ON CONFLICT (kind, (COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      WHERE resolved_at IS NULL
    DO UPDATE SET payload = alert.payload || jsonb_build_object(
      'reason', EXCLUDED.payload -> 'reason',
      'consecutive_failures', EXCLUDED.payload -> 'consecutive_failures',
      'timeouts', EXCLUDED.payload -> 'timeouts',
      'last_return_message', EXCLUDED.payload -> 'last_return_message'
    );

    IF NOT v_cron_already_open THEN
      v_opened := v_opened + 1;
    END IF;
  END IF;

  -- 2) fechar alertas cujo sinal deixou de disparar (fechamento automatico).
  --    M-DB-01: 'purge_failed' nao vem da view de saude; quem fecha e o tick, no expurgo ok.
  UPDATE public.talkx_alerts AS a
     SET resolved_at = v_now
   WHERE a.resolved_at IS NULL
     AND a.kind <> 'purge_failed'
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
  'X033 + M-DB-01 + P2 #119: avalia talkx_engine_health e abre/fecha talkx_alerts. Dedup por (tipo, campanha); fecha sozinho o alerta que parou de disparar (exceto purge_failed, fechado pelo tick). outcome_unknown_24h da view vira alerta outcome_unknown. cron_degraded abre com >=5 falhas seguidas do cron ou timeout (job startup timeout) na execucao mais recente, sobre as ultimas 10 runs; payload leva reason/consecutive_failures/timeouts/last_return_message e e atualizado enquanto o alerta segue aberto. Chamada pelo trigger_talkx_engine_tick a cada 5 min. So service_role.';

-- ============================================================================
-- Fail-closed: se qualquer peca do detector nao colar, aborta.
-- ============================================================================
DO $pgcron_detector_guard$
DECLARE
  v_missing text;
BEGIN
  IF to_regprocedure('public.talkx_engine_alerts()') IS NULL THEN
    v_missing := concat_ws(', ', v_missing, 'public.talkx_engine_alerts()');
  ELSIF position('consecutive_failures'
                 IN pg_get_functiondef('public.talkx_engine_alerts()'::regprocedure)) = 0 THEN
    v_missing := concat_ws(', ', v_missing, 'talkx_engine_alerts sem o detector novo (consecutive_failures)');
  END IF;
  IF to_regprocedure('public.talkx_engine_cron_runs(integer)') IS NULL THEN
    v_missing := concat_ws(', ', v_missing, 'public.talkx_engine_cron_runs(integer)');
  END IF;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_pgcron_detector_objetos_ausentes: %', v_missing;
  END IF;
END;
$pgcron_detector_guard$;
