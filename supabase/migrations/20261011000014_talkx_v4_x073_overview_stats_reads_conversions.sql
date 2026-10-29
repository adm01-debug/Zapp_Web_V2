-- talkx_v4_x073_overview_stats_reads_conversions
-- Rollback: recria public.talkx_overview_stats com o corpo ANTERIOR (X072, abaixo) e restaura a ACL; nada mais muda (nenhuma tabela, coluna, indice ou dado e tocado).
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.talkx_overview_stats( p_from timestamptz, p_to timestamptz, p_audience_source text DEFAULT NULL, p_department_id uuid DEFAULT NULL, p_channel text DEFAULT NULL, p_timezone text DEFAULT 'America/Sao_Paulo' ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $fn$ DECLARE v_prev_from timestamptz; v_curr jsonb; v_prev jsonb; v_active integer; v_daily jsonb; BEGIN IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'talkx_overview_stats: p_from e p_to sao obrigatorios' USING ERRCODE = '22004'; END IF; IF p_to <= p_from THEN RAISE EXCEPTION 'talkx_overview_stats: p_to precisa ser posterior a p_from' USING ERRCODE = '22007'; END IF; v_prev_from := p_from - (p_to - p_from); WITH sc AS ( SELECT campaign_id FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) ), camp AS ( SELECT c.status, c.failed_count, c.outcome_unknown_count FROM public.talkx_campaigns AS c JOIN sc ON sc.campaign_id = c.id WHERE c.started_at >= p_from AND c.started_at < p_to ), rec AS ( SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at FROM public.talkx_recipients AS r JOIN sc ON sc.campaign_id = r.campaign_id WHERE (r.sent_at >= p_from AND r.sent_at < p_to) OR (r.delivered_at >= p_from AND r.delivered_at < p_to) OR (r.replied_at >= p_from AND r.replied_at < p_to) ) SELECT jsonb_build_object( 'campaigns_sent', (SELECT count(*) FROM camp), 'completed', (SELECT count(*) FROM camp WHERE status = 'completed'), 'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec WHERE sent_at >= p_from AND sent_at < p_to), 'sent', (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to), 'delivered', (SELECT count(*) FROM rec WHERE delivered_at >= p_from AND delivered_at < p_to), 'replied', (SELECT count(*) FROM rec WHERE replied_at >= p_from AND replied_at < p_to), 'failed', (SELECT coalesce(sum(failed_count), 0) FROM camp), 'unknown', (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp), 'delivery_rate_pct', (SELECT CASE WHEN count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) > 0 THEN round(count(*) FILTER (WHERE delivered_at >= p_from AND delivered_at < p_to)::numeric / count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) * 100, 1) ELSE 0 END FROM rec), 'reply_rate_pct', (SELECT CASE WHEN count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) > 0 THEN round(count(*) FILTER (WHERE replied_at >= p_from AND replied_at < p_to)::numeric / count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to) * 100, 1) ELSE 0 END FROM rec) ) INTO v_curr; IF EXISTS ( SELECT 1 FROM public.talkx_campaigns AS c JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc ON sc.campaign_id = c.id WHERE c.started_at >= v_prev_from AND c.started_at < p_from ) THEN WITH sc AS ( SELECT campaign_id FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) ), camp AS ( SELECT c.status, c.failed_count, c.outcome_unknown_count FROM public.talkx_campaigns AS c JOIN sc ON sc.campaign_id = c.id WHERE c.started_at >= v_prev_from AND c.started_at < p_from ), rec AS ( SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at FROM public.talkx_recipients AS r JOIN sc ON sc.campaign_id = r.campaign_id WHERE (r.sent_at >= v_prev_from AND r.sent_at < p_from) OR (r.delivered_at >= v_prev_from AND r.delivered_at < p_from) OR (r.replied_at >= v_prev_from AND r.replied_at < p_from) ) SELECT jsonb_build_object( 'campaigns_sent', (SELECT count(*) FROM camp), 'completed', (SELECT count(*) FROM camp WHERE status = 'completed'), 'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from), 'sent', (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from), 'delivered', (SELECT count(*) FROM rec WHERE delivered_at >= v_prev_from AND delivered_at < p_from), 'replied', (SELECT count(*) FROM rec WHERE replied_at >= v_prev_from AND replied_at < p_from), 'failed', (SELECT coalesce(sum(failed_count), 0) FROM camp), 'unknown', (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp), 'delivery_rate_pct', (SELECT CASE WHEN count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) > 0 THEN round(count(*) FILTER (WHERE delivered_at >= v_prev_from AND delivered_at < p_from)::numeric / count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) * 100, 1) ELSE 0 END FROM rec), 'reply_rate_pct', (SELECT CASE WHEN count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) > 0 THEN round(count(*) FILTER (WHERE replied_at >= v_prev_from AND replied_at < p_from)::numeric / count(*) FILTER (WHERE sent_at >= v_prev_from AND sent_at < p_from) * 100, 1) ELSE 0 END FROM rec) ) INTO v_prev; ELSE v_prev := NULL; END IF; SELECT count(*) INTO v_active FROM public.talkx_campaigns AS c JOIN public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) AS sc ON sc.campaign_id = c.id WHERE c.status IN ('sending', 'scheduled', 'paused'); WITH days AS ( SELECT gs::date AS day FROM generate_series( (p_from AT TIME ZONE p_timezone)::date, ((p_to - interval '1 microsecond') AT TIME ZONE p_timezone)::date, interval '1 day' ) AS gs ), sc AS ( SELECT campaign_id FROM public.talkx_analytics_scope(p_audience_source, p_department_id, p_channel) ), snt AS ( SELECT (r.sent_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c FROM public.talkx_recipients AS r JOIN sc ON sc.campaign_id = r.campaign_id WHERE r.sent_at >= p_from AND r.sent_at < p_to GROUP BY 1 ), dlv AS ( SELECT (r.delivered_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c FROM public.talkx_recipients AS r JOIN sc ON sc.campaign_id = r.campaign_id WHERE r.delivered_at >= p_from AND r.delivered_at < p_to GROUP BY 1 ), rpl AS ( SELECT (r.replied_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c FROM public.talkx_recipients AS r JOIN sc ON sc.campaign_id = r.campaign_id WHERE r.replied_at >= p_from AND r.replied_at < p_to GROUP BY 1 ) SELECT jsonb_agg( jsonb_build_object( 'day', d.day, 'sent', coalesce(snt.c, 0), 'delivered', coalesce(dlv.c, 0), 'replied', coalesce(rpl.c, 0) ) ORDER BY d.day ) INTO v_daily FROM days d LEFT JOIN snt ON snt.day = d.day LEFT JOIN dlv ON dlv.day = d.day LEFT JOIN rpl ON rpl.day = d.day; RETURN jsonb_build_object( 'period', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_timezone), 'current', jsonb_set(v_curr, '{active}', to_jsonb(v_active)), 'previous', v_prev, 'active', v_active, 'daily', coalesce(v_daily, '[]'::jsonb) ); END; $fn$;
--   revoke all on function public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text) from public, anon;
--   grant execute on function public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
--
-- X073 (Fase 6 - Tela 07/01 - camada banco + testes). Acrescenta a visao geral de campanhas
-- os numeros que faltavam: leitura (read_at), conversoes (talkx_conversions) e receita, alem do
-- funil de 5 degraus (enviadas -> entregues -> lidas -> respostas -> conversoes) e a taxa de
-- conversao por segmento.
--
-- HOJE (M:20261002631230): current/previous trazem sent/delivered/replied e as taxas de entrega
--   e resposta; nao ha read, conversions, revenue nem funil; daily so tem sent/delivered/replied.
--   O funil e a conversao sao o que a Tela 07/01 mostra e hoje nao vem do banco.
--
-- FAZER (esta migration, MESMA assinatura de 6 argumentos - nenhuma sobrecarga nova):
--   (1) current e previous ganham os mesmos campos novos:
--       read            = destinatarios com read_at (leitura) no periodo;
--       conversions     = conversoes com occurred_at no periodo;
--       revenue         = soma de talkx_conversions.value no periodo;
--       conversion_rate_pct        = conversions / sent * 100;
--       segment_conversion_rate_pct = conversoes de destinatarios COM segmento / enviadas COM
--                                     segmento * 100;
--       funnel          = 5 degraus (sent, delivered, read, replied, conversions) com a contagem
--                         e o % sobre enviadas.
--   (2) daily ganha conversions (por occurred_at, com zero-fill como os demais).
--   (3) Campo cuja FONTE nunca recebeu dado no escopo (nenhuma leitura registrada em read_at;
--       nenhuma linha em talkx_conversions) vem NULL, nao zero, para a tela exibir "sem dados
--       ainda" (A9). No funil, o degrau correspondente tambem vem null.
--
-- Le a tabela talkx_conversions, cujo SELECT a authenticated/service_role a CAP-067 ja entrega
-- (M:20261002691230). Esta etapa NAO cria grant/REVOKE proprio nessa tabela.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION, mesma assinatura). Idempotente/replayavel.
-- Rollback: veja o bloco acima (recria a funcao X072 + ACL). Nenhum dado se perde.
--
-- Nota: nesta versao current/previous tambem ganham 'active' (jsonb_set), como na X072.

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
    SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at, r.read_at, r.segment_id
    FROM public.talkx_recipients AS r
    JOIN sc ON sc.campaign_id = r.campaign_id
    WHERE (r.sent_at >= p_from AND r.sent_at < p_to)
       OR (r.delivered_at >= p_from AND r.delivered_at < p_to)
       OR (r.replied_at >= p_from AND r.replied_at < p_to)
       OR (r.read_at >= p_from AND r.read_at < p_to)
  ),
  cv AS (
    SELECT cv.value,
           (SELECT r2.segment_id FROM public.talkx_recipients AS r2 WHERE r2.id = cv.recipient_id) AS segment_id
    FROM public.talkx_conversions AS cv
    JOIN sc ON sc.campaign_id = cv.campaign_id
    WHERE cv.occurred_at >= p_from AND cv.occurred_at < p_to
  ),
  flags AS (
    SELECT
      EXISTS (SELECT 1
              FROM public.talkx_recipients AS r2
              JOIN sc ON sc.campaign_id = r2.campaign_id
              WHERE r2.read_at IS NOT NULL) AS any_read,
      EXISTS (SELECT 1
              FROM public.talkx_conversions AS c2
              JOIN sc ON sc.campaign_id = c2.campaign_id) AS any_conv
  ),
  agg AS (
    SELECT
      (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to) AS sent,
      (SELECT count(*) FROM rec WHERE delivered_at >= p_from AND delivered_at < p_to) AS delivered,
      (SELECT count(*) FROM rec WHERE replied_at >= p_from AND replied_at < p_to) AS replied,
      (SELECT count(*) FROM rec WHERE read_at >= p_from AND read_at < p_to) AS read_c,
      (SELECT count(*) FROM rec WHERE sent_at >= p_from AND sent_at < p_to AND segment_id IS NOT NULL) AS sent_seg,
      (SELECT count(*) FROM cv) AS conv_c,
      (SELECT count(*) FROM cv WHERE segment_id IS NOT NULL) AS conv_seg,
      (SELECT coalesce(sum(value), 0) FROM cv) AS revenue
  )
  SELECT jsonb_build_object(
    'campaigns_sent',   (SELECT count(*) FROM camp),
    'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
    'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                         WHERE sent_at >= p_from AND sent_at < p_to),
    'sent',             a.sent,
    'delivered',        a.delivered,
    'replied',          a.replied,
    'read',             CASE WHEN f.any_read THEN to_jsonb(a.read_c) ELSE 'null'::jsonb END,
    'conversions',      CASE WHEN f.any_conv THEN to_jsonb(a.conv_c) ELSE 'null'::jsonb END,
    'revenue',          CASE WHEN f.any_conv THEN to_jsonb(a.revenue) ELSE 'null'::jsonb END,
    'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
    'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
    'delivery_rate_pct', CASE
        WHEN a.sent > 0
        THEN round(a.delivered::numeric / a.sent * 100, 1)
        ELSE 0 END,
    'reply_rate_pct', CASE
        WHEN a.sent > 0
        THEN round(a.replied::numeric / a.sent * 100, 1)
        ELSE 0 END,
    'conversion_rate_pct', CASE
        WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1)
        WHEN f.any_conv THEN 0
        ELSE NULL END,
    'segment_conversion_rate_pct', CASE
        WHEN f.any_conv AND a.sent_seg > 0 THEN round(a.conv_seg::numeric / a.sent_seg * 100, 1)
        ELSE NULL END,
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'sent',        'count', a.sent,
        'pct', CASE WHEN a.sent > 0 THEN 100.0 END),
      jsonb_build_object('step', 'delivered',   'count', a.delivered,
        'pct', CASE WHEN a.sent > 0 THEN round(a.delivered::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'read',        'count', CASE WHEN f.any_read THEN a.read_c END,
        'pct', CASE WHEN f.any_read AND a.sent > 0 THEN round(a.read_c::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'replied',     'count', a.replied,
        'pct', CASE WHEN a.sent > 0 THEN round(a.replied::numeric / a.sent * 100, 1) END),
      jsonb_build_object('step', 'conversions', 'count', CASE WHEN f.any_conv THEN a.conv_c END,
        'pct', CASE WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1) END)
    )
  ) INTO v_curr
  FROM agg a CROSS JOIN flags f;

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
      SELECT r.contact_id, r.sent_at, r.delivered_at, r.replied_at, r.read_at, r.segment_id
      FROM public.talkx_recipients AS r
      JOIN sc ON sc.campaign_id = r.campaign_id
      WHERE (r.sent_at >= v_prev_from AND r.sent_at < p_from)
         OR (r.delivered_at >= v_prev_from AND r.delivered_at < p_from)
         OR (r.replied_at >= v_prev_from AND r.replied_at < p_from)
         OR (r.read_at >= v_prev_from AND r.read_at < p_from)
    ),
    cv AS (
      SELECT cv.value,
             (SELECT r2.segment_id FROM public.talkx_recipients AS r2 WHERE r2.id = cv.recipient_id) AS segment_id
      FROM public.talkx_conversions AS cv
      JOIN sc ON sc.campaign_id = cv.campaign_id
      WHERE cv.occurred_at >= v_prev_from AND cv.occurred_at < p_from
    ),
    flags AS (
      SELECT
        EXISTS (SELECT 1
                FROM public.talkx_recipients AS r2
                JOIN sc ON sc.campaign_id = r2.campaign_id
                WHERE r2.read_at IS NOT NULL) AS any_read,
        EXISTS (SELECT 1
                FROM public.talkx_conversions AS c2
                JOIN sc ON sc.campaign_id = c2.campaign_id) AS any_conv
    ),
    agg AS (
      SELECT
        (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from) AS sent,
        (SELECT count(*) FROM rec WHERE delivered_at >= v_prev_from AND delivered_at < p_from) AS delivered,
        (SELECT count(*) FROM rec WHERE replied_at >= v_prev_from AND replied_at < p_from) AS replied,
        (SELECT count(*) FROM rec WHERE read_at >= v_prev_from AND read_at < p_from) AS read_c,
        (SELECT count(*) FROM rec WHERE sent_at >= v_prev_from AND sent_at < p_from AND segment_id IS NOT NULL) AS sent_seg,
        (SELECT count(*) FROM cv) AS conv_c,
        (SELECT count(*) FROM cv WHERE segment_id IS NOT NULL) AS conv_seg,
        (SELECT coalesce(sum(value), 0) FROM cv) AS revenue
    )
    SELECT jsonb_build_object(
      'campaigns_sent',   (SELECT count(*) FROM camp),
      'completed',        (SELECT count(*) FROM camp WHERE status = 'completed'),
      'contacts_reached', (SELECT count(DISTINCT contact_id) FROM rec
                           WHERE sent_at >= v_prev_from AND sent_at < p_from),
      'sent',             a.sent,
      'delivered',        a.delivered,
      'replied',          a.replied,
      'read',             CASE WHEN f.any_read THEN to_jsonb(a.read_c) ELSE 'null'::jsonb END,
      'conversions',      CASE WHEN f.any_conv THEN to_jsonb(a.conv_c) ELSE 'null'::jsonb END,
      'revenue',          CASE WHEN f.any_conv THEN to_jsonb(a.revenue) ELSE 'null'::jsonb END,
      'failed',           (SELECT coalesce(sum(failed_count), 0) FROM camp),
      'unknown',          (SELECT coalesce(sum(outcome_unknown_count), 0) FROM camp),
      'delivery_rate_pct', CASE
          WHEN a.sent > 0
          THEN round(a.delivered::numeric / a.sent * 100, 1)
          ELSE 0 END,
      'reply_rate_pct', CASE
          WHEN a.sent > 0
          THEN round(a.replied::numeric / a.sent * 100, 1)
          ELSE 0 END,
      'conversion_rate_pct', CASE
          WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1)
          WHEN f.any_conv THEN 0
          ELSE NULL END,
      'segment_conversion_rate_pct', CASE
          WHEN f.any_conv AND a.sent_seg > 0 THEN round(a.conv_seg::numeric / a.sent_seg * 100, 1)
          ELSE NULL END,
      'funnel', jsonb_build_array(
        jsonb_build_object('step', 'sent',        'count', a.sent,
          'pct', CASE WHEN a.sent > 0 THEN 100.0 END),
        jsonb_build_object('step', 'delivered',   'count', a.delivered,
          'pct', CASE WHEN a.sent > 0 THEN round(a.delivered::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'read',        'count', CASE WHEN f.any_read THEN a.read_c END,
          'pct', CASE WHEN f.any_read AND a.sent > 0 THEN round(a.read_c::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'replied',     'count', a.replied,
          'pct', CASE WHEN a.sent > 0 THEN round(a.replied::numeric / a.sent * 100, 1) END),
        jsonb_build_object('step', 'conversions', 'count', CASE WHEN f.any_conv THEN a.conv_c END,
          'pct', CASE WHEN f.any_conv AND a.sent > 0 THEN round(a.conv_c::numeric / a.sent * 100, 1) END)
      )
    ) INTO v_prev
    FROM agg a CROSS JOIN flags f;
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
  ),
  cvd AS (
    SELECT (cv.occurred_at AT TIME ZONE p_timezone)::date AS day, count(*) AS c
    FROM public.talkx_conversions AS cv
    JOIN sc ON sc.campaign_id = cv.campaign_id
    WHERE cv.occurred_at >= p_from AND cv.occurred_at < p_to
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'day',         d.day,
      'sent',        coalesce(snt.c, 0),
      'delivered',   coalesce(dlv.c, 0),
      'replied',     coalesce(rpl.c, 0),
      'conversions', coalesce(cvd.c, 0)
    ) ORDER BY d.day
  )
  INTO v_daily
  FROM days d
  LEFT JOIN snt ON snt.day = d.day
  LEFT JOIN dlv ON dlv.day = d.day
  LEFT JOIN rpl ON rpl.day = d.day
  LEFT JOIN cvd ON cvd.day = d.day;

  RETURN jsonb_build_object(
    'period',   jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_timezone),
    'current',  jsonb_set(v_curr, '{active}', to_jsonb(v_active)),
    'previous', v_prev,
    'active',   v_active,
    'daily',    coalesce(v_daily, '[]'::jsonb)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz, text, uuid, text, text) IS
  'Talk X (X073): visao geral por started_at; current/previous com sent/delivered/replied/read, conversions e revenue, taxas (entrega, resposta, conversao, conversao por segmento) e funil de 5 degraus (enviadas/entregues/lidas/respostas/conversoes). Campo cuja fonte nunca recebeu dado no escopo vem null (A9). daily com zero-fill. SECURITY INVOKER.';

-- ===========================================================================
-- Fail-closed: se algo nao colar, aborta em vez de deixar o contrato pela metade.
-- ===========================================================================
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
    RAISE EXCEPTION 'talkx_v4_x073_funcoes_ausentes: %', v_missing;
  END IF;

  IF to_regprocedure('public.talkx_overview_stats(timestamptz,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_v4_x073_assinatura_antiga_viva';
  END IF;
END;
$guard$;
