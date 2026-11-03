DROP FUNCTION IF EXISTS public.talkx_overview_stats(timestamptz, timestamptz)

CREATE OR REPLACE FUNCTION public.talkx_analytics_scope(
  p_audience_source text DEFAULT NULL,
  p_department_id   uuid DEFAULT NULL,
  p_channel         text DEFAULT NULL
)
RETURNS TABLE (campaign_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  SELECT c.id
  FROM public.talkx_campaigns AS c
  LEFT JOIN public.profiles AS p ON p.id = c.created_by
  WHERE (p_channel IS NULL OR p_channel = 'whatsapp')
    AND (p_audience_source IS NULL OR c.audience_source = p_audience_source)
    AND (p_department_id IS NULL OR p.department_id = p_department_id)
$fn$

REVOKE ALL ON FUNCTION public.talkx_analytics_scope(text, uuid, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.talkx_analytics_scope(text, uuid, text) TO authenticated, service_role

COMMENT ON FUNCTION public.talkx_analytics_scope(text, uuid, text) IS
  'Talk X (X072): campanhas dentro dos filtros de analytics — origem do publico, equipe (profiles.department_id) e canal (só whatsapp; outro valor => vazio). SECURITY INVOKER, sujeita a RLS.'

CREATE OR REPLACE FUNCTION public.talkx_overview_stats(
  p_from            timestamptz,
  p_to              timestamptz,
  p_audience_source text DEFAULT NULL,
  p_department_id   uuid DEFAULT NULL,
  p_channel         text DEFAULT NULL,
  p_timezone        text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_prev_from timestamptz;
  v_curr      jsonb;
  v_prev      jsonb;
  v_active    integer;
  v_daily     jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_from e p_to sao obrigatorios' USING ERRCODE = '22004';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_to precisa ser posterior a p_from' USING ERRCODE = '22007';
  END IF;

  v_prev_from := p_from - (p_to - p_from);

  -- ---------------------------------------------------------------- current
  WITH sc AS (
    SELECT campaign_id
    FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
  ),
  camp AS (
    SELECT c.status, c.failed_count, c.outcome_unknown_count
    FROM public.talkx_campaigns AS c
    JOIN sc ON sc.campaign_id = c.id
    WHERE c.started_at >= p_from AND c.started_at < p_to
  ),
  rec AS (
    SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE (r.sent_at >= p_from AND r.sent_at < p_to)
       OR (r.delivered_at >= p_from AND r.delivered_at < p_to)
       OR (r.replied_at >= p_from AND r.replied_at < p_to)
  )
  SELECT jsonb_build_object(
    'campaigns_sent',   (SELECT count(*) FROM camp),
    'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
    'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                         WHERE sent_at >= p_from AND sent_at < p_to),
    'sent',             (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to),
    'delivered',        (SELECT count(*) FROM rec WHERE delivered_at >= p_from AND delivered_at < p_to),
    'replied',          (SELECT count(*) FROM rec WHERE replied_at >= p_from AND replied_at < p_to),
    'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
    'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
    'delivery_rate_pct', (SELECT CASE
        WHEN count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) > 0
        THEN round(count(*) FILTER (WHERE delivered_at >= p_from AND delivered_at < p_to)::numeric
                   / count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) * 100, 1)
        ELSE 0 END FROM rec),
    'reply_rate_pct', (SELECT CASE
        WHEN count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) > 0
        THEN round(count(*) FILTER (WHERE replied_at >= p_from AND replied_at < p_to)::numeric
                   / count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) * 100, 1)
        ELSE 0 END FROM rec)
  ) INTO v_curr;

  -- --------------------------------------------------------------- previous
  -- NULL quando o periodo anterior nao tem campanha iniciada (sem base de comparacao).
  IF EXISTS (
    SELECT 1
    FROM public.talkx_campaigns AS c
    JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc
      ON sc.campaign_id = c.id
    WHERE c.started_at >= v_prev_from AND c.started_at < p_from
  ) THEN
    WITH sc AS (
      SELECT campaign_id
      FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
    ),
    camp AS (
      SELECT c.status, c.failed_count, c.outcome_unknown_count
      FROM public.talkx_campaigns AS c
      JOIN sc ON sc.campaign_id = c.id
      WHERE c.started_at >= v_prev_from AND c.started_at < p_from
    ),
    rec AS (
      SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at
      FROM public.talkx_recipients AS r
      JOIN sc ON sc.campaign_id = r.campaign_id
      WHERE (r.sent_at >= v_prev_from AND r.sent_at < p_from)
         OR (r.delivered_at >= v_prev_from AND r.delivered_at < p_from)
         OR (r.replied_at >= v_prev_from AND r.replied_at < p_from)
    )
    SELECT jsonb_build_object(
      'campaigns_sent',   (SELECT count(*) FROM camp),
      'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
      'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                           WHERE sent_at >= v_prev_from AND sent_at < p_from),
      'sent',             (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from),
      'delivered',        (SELECT count(*) FROM rec WHERE delivered_at >= v_prev_from AND delivered_at < p_from),
      'replied',          (SELECT count(*) FROM rec WHERE replied_at >= v_prev_from AND replied_at < p_from),
      'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
      'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
      'delivery_rate_pct', (SELECT CASE
          WHEN count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) > 0
          THEN round(count(*) FILTER (WHERE delivered_at >= v_prev_from AND delivered_at < p_from)::numeric
                     / count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) * 100, 1)
          ELSE 0 END FROM rec),
      'reply_rate_pct', (SELECT CASE
          WHEN count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) > 0
          THEN round(count(*) FILTER (WHERE replied_at >= v_prev_from AND replied_at < p_from)::numeric
                     / count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) * 100, 1)
          ELSE 0 END FROM rec)
    ) INTO v_prev;
  ELSE
    v_prev := NULL;
  END IF;

  -- ----------------------------------------------------------------- active
  -- O "agora" da operacao, sem recorte de periodo.
  SELECT count(*) INTO v_active
  FROM public.talkx_campaigns AS c
  JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc
    ON sc.campaign_id = c.id
  WHERE c.status IN ('sending', 'scheduled', 'paused');

  -- ------------------------------------------------------------------ daily
  -- Um ponto por dia do periodo, no fuso pedido, com zero-fill.
  WITH days AS (
    SELECT gs::date AS day
    FROM generate_series(
      (p_from AT TIME ZONE p_timezone)::date,
      ((p_to - interval '1 microsecond') AT TIME ZONE p_timezone)::date,
      interval '1 day'
    ) AS gs
  ),
  sc AS (
    SELECT campaign_id
    FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel)
  ),
  snt AS (
    SELECT (r.sent_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.sent_at >= p_from AND r.sent_at < p_to
    GROUP BY 1
  ),
  dlv AS (
    SELECT (r.delivered_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.delivered_at >= p_from AND r.delivered_at < p_to
    GROUP BY 1
  ),
  rpl AS (
    SELECT (r.replied_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE r.replied_at >= p_from AND r.replied_at < p_to
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'day',       d.day,
      'sent',      coalesce(snt.c, 0),
      'delivered', coalesce(dlv.c, 0),
      'replied',   coalesce(rpl.c, 0)
    ) ORDER BY d.day
  )
  INTO v_daily
  FROM days d
  LEFT JOIN snt ON snt.day = d.day
  LEFT JOIN dlv ON dlv.day = d.day
  LEFT JOIN rpl ON rpl.day = d.day;

  RETURN jsonb_build_object(
    'period',   jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_timezone),
    'current',  jsonb_set(v_curr, '{active}', to_jsonb(v_active)),
    'previous', v_prev,
    'active',   v_active,
    'daily',    coalesce(v_daily, '[]'::jsonb)
  );
END;
$fn$

REVOKE ALL ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text)
  FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text)
  TO authenticated, service_role

COMMENT ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text) IS
  'Talk X (X072): visao geral por started_at (current/previous com os mesmos campos), contacts_reached = contatos distintos com sent_at no periodo, active = sending/scheduled/paused, daily com zero-fill; filtros de audience_source/department_id/channel e fuso (padrao America/Sao_Paulo). SECURITY INVOKER.'

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_sent_at
  ON public.talkx_recipients (sent_at)

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_replied_at
  ON public.talkx_recipients (replied_at)

DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_overview_stats(timestamptz,timestamptz,text,uuid,text,text)'),
      ('public.talkx_analytics_scope(text,uuid,text)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_v4_x072_funcoes_ausentes: %', v_missing;
  END IF;

  -- A assinatura antiga de 2 argumentos NAO pode ter sobrado (ambiguidade 42725).
  IF to_regprocedure('public.talkx_overview_stats(timestamptz,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_v4_x072_assinatura_antiga_viva';
  END IF;
END;
$guard$
