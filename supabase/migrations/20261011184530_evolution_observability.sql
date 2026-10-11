-- evolution_observability
-- Rollback: apaga o job de retencao, as tres funcoes e as duas tabelas novas (ordem inversa da criacao).
-- Rollback (SQL executavel, na ordem):
--   SELECT cron.unschedule('evolution-observability-retention');
--   DROP FUNCTION IF EXISTS public.evolution_observability_retention(integer);
--   DROP FUNCTION IF EXISTS public.webhook_events_overview(integer);
--   DROP FUNCTION IF EXISTS public.evolution_api_calls_overview(integer);
--   DROP TABLE IF EXISTS public.webhook_events_log;
--   DROP TABLE IF EXISTS public.evolution_api_calls;
--
-- Observabilidade das chamadas a Evolution e dos eventos recebidos pelo webhook.
-- Problema: a V2 nao registrava, de forma consultavel, o sucesso/falha/latencia das
-- chamadas a Evolution nem os eventos que chegam no webhook; suporte nao conseguia
-- investigar por que algo nao saiu ou nao chegou (a V3 tinha AdminEvolutionApiLogsPage,
-- AdminWebhookEventsPage e AdminWebhookOverviewPage).
--
-- Regras do dono respeitadas aqui:
--   * NENHUM dado pessoal: telefone, texto de mensagem, midia e token NAO entram.
--     Guardamos so metadados: instancia, caminho do endpoint (sem query string),
--     metodo, status, ok, latencia, tentativa, motivo de retentativa, codigo de erro.
--   * RLS ligada nas duas tabelas; leitura so para admin (is_admin(auth.uid()));
--     escrita so para service_role (GRANT de INSERT; o papel ja tem BYPASSRLS).
--   * Retencao de 30 dias por job do pg_cron (ja usado na V2).
--   * Funcoes de agregacao para a tela, SECURITY DEFINER com SET search_path e
--     checagem de auth.uid() via is_admin(auth.uid()).
-- Nada aqui altera tabela, policy, GRANT ou dado existente — migration puramente aditiva.

-- ===========================================================================
-- 1. Tabelas
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.evolution_api_calls (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  instance     text,
  endpoint     text        NOT NULL,
  method       text        NOT NULL,
  status_code  integer,
  ok           boolean     NOT NULL,
  latency_ms   integer,
  attempt      integer     NOT NULL DEFAULT 1,
  retry_reason text,
  error_code   text,
  CONSTRAINT evolution_api_calls_endpoint_path_chk
    CHECK (endpoint LIKE '/%' AND position('?' IN endpoint) = 0),
  CONSTRAINT evolution_api_calls_method_chk
    CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  CONSTRAINT evolution_api_calls_status_chk
    CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
  CONSTRAINT evolution_api_calls_latency_chk
    CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT evolution_api_calls_attempt_chk
    CHECK (attempt >= 1)
);

COMMENT ON TABLE public.evolution_api_calls IS
  'Observabilidade (sem PII) das chamadas HTTP a Evolution: instancia, caminho, metodo, status, ok, latencia, tentativa, motivo de retentativa e codigo de erro. Leitura so admin; escrita so service_role; retencao 30 dias.';
COMMENT ON COLUMN public.evolution_api_calls.endpoint IS
  'Somente o caminho do endpoint (comeca com "/", sem query string). Nada de telefone, texto ou token.';

CREATE INDEX IF NOT EXISTS evolution_api_calls_created_idx
  ON public.evolution_api_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS evolution_api_calls_instance_created_idx
  ON public.evolution_api_calls (instance, created_at DESC);

CREATE TABLE IF NOT EXISTS public.webhook_events_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at       timestamptz NOT NULL DEFAULT now(),
  instance          text,
  event_type        text        NOT NULL,
  message_type      text,
  processing_status text        NOT NULL,
  error_code        text,
  latency_ms        integer,
  CONSTRAINT webhook_events_log_status_chk
    CHECK (processing_status IN ('ok', 'ignored', 'error')),
  CONSTRAINT webhook_events_log_latency_chk
    CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

COMMENT ON TABLE public.webhook_events_log IS
  'Observabilidade (sem PII) dos eventos recebidos pelo webhook da Evolution: instancia, tipo de evento, tipo de mensagem, status de processamento, codigo de erro e latencia. Leitura so admin; escrita so service_role; retencao 30 dias.';
COMMENT ON COLUMN public.webhook_events_log.message_type IS
  'Tipo de mensagem (texto, imagem, audio...). NUNCA o conteudo da mensagem.';

CREATE INDEX IF NOT EXISTS webhook_events_log_received_idx
  ON public.webhook_events_log (received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_log_instance_received_idx
  ON public.webhook_events_log (instance, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_log_status_received_idx
  ON public.webhook_events_log (processing_status, received_at DESC);

-- ===========================================================================
-- 2. RLS + GRANT: leitura so admin, escrita so service_role
-- ===========================================================================

ALTER TABLE public.evolution_api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events_log  ENABLE ROW LEVEL SECURITY;

-- Politica explicita (nada de USING (true)): so o admin le.
DROP POLICY IF EXISTS evolution_api_calls_admin_read ON public.evolution_api_calls;
CREATE POLICY evolution_api_calls_admin_read ON public.evolution_api_calls
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS webhook_events_log_admin_read ON public.webhook_events_log;
CREATE POLICY webhook_events_log_admin_read ON public.webhook_events_log
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Tabela nova nasce com GRANT a PUBLIC/anon/authenticated por padrao: revoga tudo e
-- concede so o necessario. Escrita (INSERT) apenas para service_role; UPDATE/DELETE
-- ficam fora (o expurgo roda como dono, via funcao SECURITY DEFINER).
REVOKE ALL ON TABLE public.evolution_api_calls FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.webhook_events_log  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.evolution_api_calls TO authenticated;
GRANT SELECT ON TABLE public.webhook_events_log  TO authenticated;

GRANT INSERT ON TABLE public.evolution_api_calls TO service_role;
GRANT INSERT ON TABLE public.webhook_events_log  TO service_role;

-- ===========================================================================
-- 3. Funcoes de agregacao para a tela
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.evolution_api_calls_overview(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hours  integer;
  v_since  timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'acesso_restrito_evolution_observability' USING ERRCODE = '42501';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_window_hours, 24), 720));
  v_since := now() - make_interval(hours => v_hours);

  SELECT jsonb_build_object(
    'window_hours', v_hours,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'calls',          t.calls,
      'ok',             t.ok_calls,
      'errors',         t.errors,
      'error_rate',     CASE WHEN t.calls > 0 THEN round(t.errors::numeric / t.calls, 4) ELSE 0 END,
      'avg_latency_ms', t.avg_latency,
      'p90_latency_ms', t.p90_latency
    ),
    'by_instance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'instance',       pi.instance,
        'calls',          pi.calls,
        'errors',         pi.errors,
        'error_rate',     CASE WHEN pi.calls > 0 THEN round(pi.errors::numeric / pi.calls, 4) ELSE 0 END,
        'avg_latency_ms', pi.avg_latency,
        'p90_latency_ms', pi.p90_latency
      ) ORDER BY pi.calls DESC, pi.instance)
      FROM (
        SELECT b.instance,
               count(*)                              AS calls,
               count(*) FILTER (WHERE NOT b.ok)      AS errors,
               round(avg(b.latency_ms))              AS avg_latency,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY b.latency_ms) AS p90_latency
        FROM public.evolution_api_calls b
        WHERE b.created_at >= v_since
        GROUP BY b.instance
      ) pi
    ), '[]'::jsonb),
    'by_hour', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket',         ph.bucket,
        'calls',          ph.calls,
        'errors',         ph.errors,
        'error_rate',     CASE WHEN ph.calls > 0 THEN round(ph.errors::numeric / ph.calls, 4) ELSE 0 END,
        'avg_latency_ms', ph.avg_latency,
        'p90_latency_ms', ph.p90_latency
      ) ORDER BY ph.bucket)
      FROM (
        SELECT date_trunc('hour', b.created_at)      AS bucket,
               count(*)                              AS calls,
               count(*) FILTER (WHERE NOT b.ok)      AS errors,
               round(avg(b.latency_ms))              AS avg_latency,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY b.latency_ms) AS p90_latency
        FROM public.evolution_api_calls b
        WHERE b.created_at >= v_since
        GROUP BY 1
      ) ph
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT count(*)                                  AS calls,
           count(*) FILTER (WHERE ok)                AS ok_calls,
           count(*) FILTER (WHERE NOT ok)            AS errors,
           round(avg(latency_ms))                    AS avg_latency,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms) AS p90_latency
    FROM public.evolution_api_calls
    WHERE created_at >= v_since
  ) t;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.webhook_events_overview(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hours  integer;
  v_since  timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'acesso_restrito_evolution_observability' USING ERRCODE = '42501';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_window_hours, 24), 720));
  v_since := now() - make_interval(hours => v_hours);

  SELECT jsonb_build_object(
    'window_hours', v_hours,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'events',         t.events,
      'ok',             t.ok_events,
      'ignored',        t.ignored_events,
      'errors',         t.error_events,
      'error_rate',     CASE WHEN t.events > 0 THEN round(t.error_events::numeric / t.events, 4) ELSE 0 END,
      'avg_latency_ms', t.avg_latency,
      'p90_latency_ms', t.p90_latency
    ),
    'by_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'processing_status', ps.processing_status,
        'events',            ps.events,
        'avg_latency_ms',    ps.avg_latency,
        'p90_latency_ms',    ps.p90_latency
      ) ORDER BY ps.events DESC, ps.processing_status)
      FROM (
        SELECT b.processing_status,
               count(*)                          AS events,
               round(avg(b.latency_ms))          AS avg_latency,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY b.latency_ms) AS p90_latency
        FROM public.webhook_events_log b
        WHERE b.received_at >= v_since
        GROUP BY b.processing_status
      ) ps
    ), '[]'::jsonb),
    'by_event_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'event_type',     pe.event_type,
        'events',         pe.events,
        'errors',         pe.errors,
        'error_rate',     CASE WHEN pe.events > 0 THEN round(pe.errors::numeric / pe.events, 4) ELSE 0 END,
        'avg_latency_ms', pe.avg_latency,
        'p90_latency_ms', pe.p90_latency
      ) ORDER BY pe.events DESC, pe.event_type)
      FROM (
        SELECT b.event_type,
               count(*)                                                       AS events,
               count(*) FILTER (WHERE b.processing_status = 'error')          AS errors,
               round(avg(b.latency_ms))                                       AS avg_latency,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY b.latency_ms)      AS p90_latency
        FROM public.webhook_events_log b
        WHERE b.received_at >= v_since
        GROUP BY b.event_type
      ) pe
    ), '[]'::jsonb),
    'by_hour', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket',         ph.bucket,
        'events',         ph.events,
        'errors',         ph.errors,
        'error_rate',     CASE WHEN ph.events > 0 THEN round(ph.errors::numeric / ph.events, 4) ELSE 0 END,
        'avg_latency_ms', ph.avg_latency,
        'p90_latency_ms', ph.p90_latency
      ) ORDER BY ph.bucket)
      FROM (
        SELECT date_trunc('hour', b.received_at)                                     AS bucket,
               count(*)                                                              AS events,
               count(*) FILTER (WHERE b.processing_status = 'error')                 AS errors,
               round(avg(b.latency_ms))                                              AS avg_latency,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY b.latency_ms)             AS p90_latency
        FROM public.webhook_events_log b
        WHERE b.received_at >= v_since
        GROUP BY 1
      ) ph
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT count(*)                                                        AS events,
           count(*) FILTER (WHERE processing_status = 'ok')                AS ok_events,
           count(*) FILTER (WHERE processing_status = 'ignored')           AS ignored_events,
           count(*) FILTER (WHERE processing_status = 'error')             AS error_events,
           round(avg(latency_ms))                                          AS avg_latency,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms)          AS p90_latency
    FROM public.webhook_events_log
    WHERE received_at >= v_since
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.evolution_api_calls_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evolution_api_calls_overview(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.webhook_events_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webhook_events_overview(integer) TO authenticated;

-- ===========================================================================
-- 4. Retencao de 30 dias (job agendado)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.evolution_observability_retention(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days   integer;
  v_cutoff timestamptz;
  v_calls  integer;
  v_events integer;
BEGIN
  v_days   := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_cutoff := now() - make_interval(days => v_days);

  DELETE FROM public.evolution_api_calls WHERE created_at  < v_cutoff;
  GET DIAGNOSTICS v_calls = ROW_COUNT;

  DELETE FROM public.webhook_events_log  WHERE received_at < v_cutoff;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN v_calls + v_events;
END;
$$;

-- Expurgo roda como dono (postgres), so pelo job: nenhum usuario final executa.
REVOKE ALL ON FUNCTION public.evolution_observability_retention(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'evolution-observability-retention',
  '30 4 * * *',
  'SELECT public.evolution_observability_retention();'
);
