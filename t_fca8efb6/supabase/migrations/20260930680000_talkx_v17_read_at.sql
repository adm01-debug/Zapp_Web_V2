-- talkx_v17_read_at
-- versão 20260930680000 reservada para hermes-talkx-fase1-v12-v21-2610011215c53b (renumerada de 20260930610000 por colisão de versão com outro chat)
-- nomes-antigos-conferidos: record_talkx_recipient_delivered — o DROP remove só a assinatura de 2 args; o código chama a de 3 args (p_event) — evita PGRST203 de ambiguidade.
-- rollback: 1) DROP INDEX idx_talkx_recipients_read_at + ALTER TABLE talkx_recipients DROP COLUMN read_at;
--           2) recrie record_talkx_recipient_delivered(text,uuid) sem p_event (corpo da 20260912110000);
--           3) recrie talkx_campaign_report sem read_count (corpo da 20260930670000).
--
-- V17 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29.
-- Hoje: read_at não existe; READ/PLAYED só atualiza a tabela messages; o KPI
-- "Lidas" fica null. Fazer: read_at em talkx_recipients + índice;
-- record_talkx_recipient_delivered ganha p_event ('delivered'|'read');
-- READ/PLAYED chama a RPC; relatório expõe read_count.
-- Classe: contrato (ADD COLUMN nullable + CREATE INDEX + CREATE OR REPLACE FUNCTION) —
--         a coluna é nullable (aditiva na prática) mas o CREATE OR REPLACE força a
--         aplicação pós-merge/deploy para o webhook novo não rodar contra schema velho.

-- 1) read_at + índice ------------------------------------------------------------
ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_read_at
  ON public.talkx_recipients (read_at)
  WHERE read_at IS NOT NULL;

-- 2) record_talkx_recipient_delivered com p_event --------------------------------
--    Substitui a assinatura de 2 args (text,uuid) pela de 3 (text,uuid,text DEFAULT).
--    Sem o DROP, a chamada de 2 args ficaria ambígua (PGRST203).
DROP FUNCTION IF EXISTS public.record_talkx_recipient_delivered(text, uuid);

CREATE OR REPLACE FUNCTION public.record_talkx_recipient_delivered(
  p_external_id text,
  p_connection_id uuid,
  p_event text DEFAULT 'delivered'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_ack' USING ERRCODE = '22023';
  END IF;
  IF p_event NOT IN ('delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_event' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  BEGIN
    SELECT recipient.id, recipient.campaign_id
      INTO STRICT v_recipient_id, v_campaign_id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE recipient.external_id = v_external_id
       AND campaign.whatsapp_connection_id = p_connection_id
       AND (
         (p_event = 'delivered' AND recipient.delivered_at IS NULL)
         OR (p_event = 'read' AND recipient.read_at IS NULL AND recipient.delivered_at IS NOT NULL)
       )
     FOR UPDATE OF recipient;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  IF p_event = 'read' THEN
    UPDATE public.talkx_recipients
       SET read_at = statement_timestamp(),
           updated_at = statement_timestamp()
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET read_count = campaign.read_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_campaign_id;
  ELSE
    UPDATE public.talkx_recipients
       SET status = 'delivered',
           delivered_at = statement_timestamp(),
           updated_at = statement_timestamp()
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET delivered_count = campaign.delivered_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_campaign_id;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_recipient_delivered(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_delivered(text, uuid, text)
  TO service_role;

-- 3) relatório expõe read_count --------------------------------------------------
CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
  p_campaign uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = 'P0002';
  END IF;

  WITH camp AS (
    SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
  ),
  kpis AS (
    SELECT
      c.total_recipients,
      c.sent_count,
      c.delivered_count,
      c.read_count,
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
      COUNT(*) FILTER (WHERE r.status IN ('sent','delivered')) AS sent,
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
      v.label      AS variant_name,
      COUNT(r.id)  AS recipients,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id
    WHERE r.campaign_id = p_campaign
    GROUP BY v.id, v.label
  )
  SELECT jsonb_build_object(
    'campaign_id',  p_campaign,
    'kpis',         to_jsonb(kpis.*),
    'by_status',    (SELECT jsonb_object_agg(status, cnt) FROM by_status),
    'hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h),
    'by_variant',   (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)
  ) INTO v_result
  FROM kpis;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;
