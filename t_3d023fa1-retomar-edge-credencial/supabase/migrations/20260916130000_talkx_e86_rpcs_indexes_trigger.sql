-- ─────────────────────────────────────────────────────────────────────────────
-- E86 · RPCs de agregação + índices compostos + trigger use_count
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Índices compostos que faltavam ────────────────────────────────────────
-- Obs: (campaign_id) simples, (contact_id), (campaign_id, created_at desc)
--      e (phone) em blacklist já existem; só os compostos abaixo são novos.

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_campaign_status
  ON public.talkx_recipients (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_campaign_sent_at
  ON public.talkx_recipients (campaign_id, sent_at)
  WHERE sent_at IS NOT NULL;

-- ── 2. Função‑trigger: incrementa use_count ao lançar campanha com template ──

CREATE OR REPLACE FUNCTION public.trg_talkx_increment_template_use_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- INSERT com template e status != draft
  IF TG_OP = 'INSERT'
     AND NEW.template_id IS NOT NULL
     AND NEW.status <> 'draft'
  THEN
    UPDATE public.talkx_templates
       SET use_count = COALESCE(use_count, 0) + 1
     WHERE id = NEW.template_id;

  -- UPDATE: saiu de draft com template presente
  ELSIF TG_OP = 'UPDATE'
     AND NEW.template_id IS NOT NULL
     AND COALESCE(OLD.status, '') = 'draft'
     AND NEW.status <> 'draft'
  THEN
    UPDATE public.talkx_templates
       SET use_count = COALESCE(use_count, 0) + 1
     WHERE id = NEW.template_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talkx_template_use_count ON public.talkx_campaigns;

CREATE TRIGGER trg_talkx_template_use_count
  AFTER INSERT OR UPDATE OF status ON public.talkx_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_talkx_increment_template_use_count();

-- ── 3. RPC: talkx_overview_stats ─────────────────────────────────────────────
-- Retorna estatísticas agregadas para um período; período anterior calculado
-- com a mesma duração para comparação percentual.

CREATE OR REPLACE FUNCTION public.talkx_overview_stats(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_duration  interval := p_to - p_from;
  v_prev_from timestamptz := p_from - v_duration;

  v_curr      jsonb;
  v_prev      jsonb;
  v_by_status jsonb;
  v_daily     jsonb;
BEGIN
  SELECT jsonb_build_object(
    'campaigns',       COUNT(*),
    'contacts_reached',COALESCE(SUM(total_recipients), 0),
    'sent',            COALESCE(SUM(sent_count), 0),
    'delivered',       COALESCE(SUM(delivered_count), 0),
    'failed',          COALESCE(SUM(failed_count), 0),
    'unknown',         COALESCE(SUM(outcome_unknown_count), 0),
    'completed',       COUNT(*) FILTER (WHERE status = 'completed'),
    'active',          COUNT(*) FILTER (WHERE status IN ('running','paused')),
    'delivery_rate_pct', ROUND(
      CASE WHEN SUM(sent_count) > 0
        THEN SUM(delivered_count)::numeric / SUM(sent_count) * 100
        ELSE 0
      END, 1
    )
  ) INTO v_curr
  FROM public.talkx_campaigns
  WHERE created_at >= p_from AND created_at < p_to;

  SELECT jsonb_build_object(
    'campaigns',       COUNT(*),
    'contacts_reached',COALESCE(SUM(total_recipients), 0),
    'sent',            COALESCE(SUM(sent_count), 0),
    'delivery_rate_pct', ROUND(
      CASE WHEN SUM(sent_count) > 0
        THEN SUM(delivered_count)::numeric / SUM(sent_count) * 100
        ELSE 0
      END, 1
    )
  ) INTO v_prev
  FROM public.talkx_campaigns
  WHERE created_at >= v_prev_from AND created_at < p_from;

  SELECT jsonb_object_agg(status, cnt) INTO v_by_status
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM public.talkx_campaigns
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY status
  ) sub;

  SELECT jsonb_agg(
    jsonb_build_object('day', day, 'sends', sends)
    ORDER BY day
  ) INTO v_daily
  FROM (
    SELECT date_trunc('day', sent_at) AS day, COUNT(*) AS sends
    FROM public.talkx_recipients
    WHERE sent_at >= p_from AND sent_at < p_to
    GROUP BY 1
  ) sub;

  RETURN jsonb_build_object(
    'period',       jsonb_build_object('from', p_from, 'to', p_to),
    'current',      v_curr,
    'previous',     v_prev,
    'by_status',    COALESCE(v_by_status, '{}'::jsonb),
    'daily_sends',  COALESCE(v_daily, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz) TO service_role, authenticated;

-- ── 4. RPC: talkx_campaign_report ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
  p_campaign uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH camp AS (
    SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
  ),
  kpis AS (
    SELECT
      c.total_recipients,
      c.sent_count,
      c.delivered_count,
      c.failed_count,
      c.outcome_unknown_count,
      ROUND(
        CASE WHEN c.sent_count > 0
          THEN c.delivered_count::numeric / c.sent_count * 100
          ELSE 0
        END, 1
      ) AS delivery_rate_pct,
      EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs
    FROM camp c
  ),
  hourly AS (
    SELECT
      date_trunc('hour', r.sent_at)                 AS hour,
      COUNT(*) FILTER (WHERE r.status = 'sent')     AS sent,
      COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  ),
  by_status AS (
    SELECT status, COUNT(*) AS cnt
    FROM public.talkx_recipients
    WHERE campaign_id = p_campaign
    GROUP BY 1
  ),
  by_variant AS (
    SELECT
      v.id         AS variant_id,
      v.variant_name,
      COUNT(r.id)  AS recipients,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent
    FROM public.talkx_recipients r
    LEFT JOIN public.campaign_ab_variants v ON v.id = r.variant_id AND v.campaign_id = p_campaign
    WHERE r.campaign_id = p_campaign
    GROUP BY v.id, v.variant_name
  )
  SELECT jsonb_build_object(
    'campaign_id',  p_campaign,
    'kpis',         to_jsonb(kpis.*),
    'by_status',    (SELECT jsonb_object_agg(status, cnt) FROM by_status),
    'hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h),
    'by_variant',   (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)
  )
  FROM kpis;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) TO service_role, authenticated;

-- ── 5. RPC: talkx_segment_tags ───────────────────────────────────────────────
-- Top 10 tags dos contatos que já foram destinatários de campanhas deste segmento.

CREATE OR REPLACE FUNCTION public.talkx_segment_tags(
  p_segment uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt) ORDER BY cnt DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT tag, COUNT(DISTINCT c.id) AS cnt
    FROM public.talkx_campaigns tc
    JOIN public.talkx_recipients r ON r.campaign_id = tc.id
    JOIN public.contacts c ON c.id = r.contact_id
    CROSS JOIN LATERAL unnest(c.tags) AS tag
    WHERE tc.segment_id = p_segment
      AND c.tags IS NOT NULL
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 10
  ) top;
$$;

REVOKE ALL ON FUNCTION public.talkx_segment_tags(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_segment_tags(uuid) TO service_role, authenticated;
