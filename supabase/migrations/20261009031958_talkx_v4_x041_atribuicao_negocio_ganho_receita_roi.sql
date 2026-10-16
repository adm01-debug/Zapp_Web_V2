-- talkx_v4_x041_atribuicao_negocio_ganho_receita_roi
-- Rollback: recria record_talkx_conversion com o corpo ANTERIOR (abaixo, sem 'deal'),
-- Rollback: restaura o CHECK de origem do X021, apaga a conversão de origem 'deal', a chave
-- Rollback: attribution_window_days, o índice e as colunas source/external_id de contact_purchases,
-- Rollback: e dropa as duas funções novas.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_attribute_purchases(timestamptz);
--   drop function if exists public.talkx_campaign_revenue(uuid);
--   -- corpo ANTERIOR de record_talkx_conversion (reemissão 20261002691230, SEM 'deal'):
--   create or replace function public.record_talkx_conversion(p_campaign_id uuid, p_external_ref text, p_value numeric, p_source text, p_currency text default 'BRL', p_link_id uuid default null, p_recipient_id uuid default null, p_occurred_at timestamptz default now(), p_attribution jsonb default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$ declare v_max_value numeric; v_link_campaign uuid; v_id uuid; begin if auth.role() is distinct from 'service_role' then raise exception 'talkx_conversion_service_role_only' using errcode = '42501'; end if; v_max_value := coalesce((select (value #>> '{}')::numeric from public.talkx_settings where key = 'conversion_max_value'), 100000); if p_value < 0 then raise exception 'talkx_conversion_value_negative' using errcode = '22023'; end if; if p_value > v_max_value then raise exception 'talkx_conversion_value_exceeds_max' using errcode = '22023'; end if; if p_source not in ('whatsapp','manual','import','api','checkout') then raise exception 'talkx_conversion_invalid_source' using errcode = '22023'; end if; if p_link_id is not null then select campaign_id into v_link_campaign from public.talkx_links where id = p_link_id; if v_link_campaign is distinct from p_campaign_id then raise exception 'talkx_conversion_link_campaign_mismatch' using errcode = '23503'; end if; end if; if p_occurred_at > now() + interval '1 hour' then raise exception 'talkx_conversion_occurred_at_in_future' using errcode = '22023'; end if; insert into public.talkx_conversions (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution) values (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, p_occurred_at, p_currency, p_attribution) on conflict (campaign_id, source, external_ref) where external_ref is not null and source is not null do nothing returning id into v_id; if v_id is null then return jsonb_build_object('status', 'duplicate'); end if; return jsonb_build_object('status', 'recorded', 'id', v_id); end; $function$;
--   delete from public.talkx_conversions where source = 'deal';
--   alter table public.talkx_conversions drop constraint if exists talkx_conversions_source_check;
--   alter table public.talkx_conversions add constraint talkx_conversions_source_check check (source is null or source in ('whatsapp','manual','import','api','checkout'));
--   delete from public.talkx_settings where key = 'attribution_window_days';
--   drop index if exists public.contact_purchases_source_external_id_key;
--   alter table public.contact_purchases drop column if exists source;
--   alter table public.contact_purchases drop column if exists external_id;
--
-- X041 · Registrar negócio ganho como conversão na janela de atribuição; receita e ROI.
-- Fecha CAP-065 (conversão automática) e CAP-068. Camada: banco + cron. DDL: sim.
-- Classe: contrato (CREATE OR REPLACE FUNCTION + ALTER TABLE ADD COLUMN nullable + índice + GRANT/REVOKE).
--
-- Pré-requisito instrumental declarado no próprio item: `contact_purchases.source` e
-- `contact_purchases.external_id` (campos em que a função pedida opera — "compra source='bitrix24'",
-- "external_ref = external_id da compra"). Na ponta 2026-10-08/migration de 09-10 as duas colunas
-- NÃO existiam (schema-catalog.json sem `contact_purchases.source`/`external_id`), então elas entram
-- aqui, de forma idempotente, porque sem elas a função pedida não compila. O resto de X039
-- (ação `pull_won_deals` na Edge `bitrix-api`, RPC `talkx_upsert_purchases_batch` e a linha em
-- `talkx_data_jobs`) NÃO é feito aqui: segue na trilha de banco+edge+cron.
--
-- A linha de agendamento em `talkx_data_jobs` (X036) também não é criada aqui porque a tabela
-- ainda não existe na ponta; `talkx_attribute_purchases` fica pronta para ser pendurada nela.

-- ============================================================================
-- (1) contact_purchases — chave de origem (pré-requisito instrumental de X041)
-- ============================================================================
ALTER TABLE public.contact_purchases
  ADD COLUMN IF NOT EXISTS source      text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS contact_purchases_source_external_id_key
  ON public.contact_purchases (source, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.contact_purchases.source IS
  'Origem da compra (ex.: bitrix24). Linhas antigas ficam com NULL.';
COMMENT ON COLUMN public.contact_purchases.external_id IS
  'Identificador da compra na origem (ex.: ID do negócio no Bitrix24); único por origem.';

-- ============================================================================
-- (2) talkx_settings — janela de atribuição e teto de conversão (seed idempotente)
-- ============================================================================
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('attribution_window_days', '30',     'Janela de atribuição: dias entre o envio e a compra em que a venda conta para a campanha'),
  ('conversion_max_value',    '100000', 'Teto de valor por conversão (BRL)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- (3) talkx_conversions — 'deal' passa a ser uma origem válida
-- ============================================================================
ALTER TABLE public.talkx_conversions DROP CONSTRAINT IF EXISTS talkx_conversions_source_check;
ALTER TABLE public.talkx_conversions ADD CONSTRAINT talkx_conversions_source_check
  CHECK (source IS NULL OR source IN ('whatsapp','manual','import','api','checkout','deal'));

-- ============================================================================
-- (4) record_talkx_conversion — reemissão com 'deal' na lista de origens.
--     Corpo idêntico ao de 20261002691230, exceto a lista de origens aceitas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_talkx_conversion(
  p_campaign_id   uuid,
  p_external_ref  text,
  p_value         numeric,
  p_source        text,
  p_currency      text DEFAULT 'BRL',
  p_link_id       uuid DEFAULT NULL,
  p_recipient_id  uuid DEFAULT NULL,
  p_occurred_at   timestamptz DEFAULT now(),
  p_attribution   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_max_value     numeric;
  v_link_campaign uuid;
  v_id            uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'talkx_conversion_service_role_only' USING ERRCODE = '42501';
  END IF;

  v_max_value := COALESCE(
    (SELECT (value #>> '{}')::numeric FROM public.talkx_settings WHERE key = 'conversion_max_value'),
    100000
  );

  IF p_value < 0 THEN
    RAISE EXCEPTION 'talkx_conversion_value_negative' USING ERRCODE = '22023';
  END IF;
  IF p_value > v_max_value THEN
    RAISE EXCEPTION 'talkx_conversion_value_exceeds_max' USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('whatsapp','manual','import','api','checkout','deal') THEN
    RAISE EXCEPTION 'talkx_conversion_invalid_source' USING ERRCODE = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT campaign_id INTO v_link_campaign FROM public.talkx_links WHERE id = p_link_id;
    IF v_link_campaign IS DISTINCT FROM p_campaign_id THEN
      RAISE EXCEPTION 'talkx_conversion_link_campaign_mismatch' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_occurred_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'talkx_conversion_occurred_at_in_future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.talkx_conversions
    (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution)
  VALUES
    (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, p_occurred_at, p_currency, p_attribution)
  ON CONFLICT (campaign_id, source, external_ref) WHERE external_ref IS NOT NULL AND source IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  RETURN jsonb_build_object('status', 'recorded', 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) TO service_role;

-- ============================================================================
-- (5) talkx_attribute_purchases — último toque na janela de atribuição
--     SECURITY DEFINER porque chama record_talkx_conversion (service_role only);
--     EXECUTE só para service_role (o job de dados).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_attribute_purchases(p_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_window_days integer;
  v_since       timestamptz;
  v_scanned     integer := 0;
  v_attributed  integer := 0;
  v_no_touch    integer := 0;
  v_duplicate   integer := 0;
  v_rejected    integer := 0;
  v_purchase    record;
  v_recipient   record;
  v_result      jsonb;
BEGIN
  -- Janela de atribuição em dias; padrão 30 quando a chave não existe.
  v_window_days := COALESCE(
    (SELECT NULLIF(value #>> '{}', '')::integer
       FROM public.talkx_settings WHERE key = 'attribution_window_days'),
    30
  );
  IF v_window_days < 0 THEN
    RAISE EXCEPTION 'talkx_attribution_window_invalid' USING ERRCODE = '22023';
  END IF;

  v_since := COALESCE(p_since, now() - (v_window_days || ' days')::interval);

  FOR v_purchase IN
    SELECT cp.id, cp.contact_id, cp.external_id, cp.amount, cp.currency, cp.purchased_at
      FROM public.contact_purchases cp
     WHERE cp.source = 'bitrix24'
       AND cp.external_id IS NOT NULL
       AND cp.purchased_at IS NOT NULL
       AND cp.purchased_at >= v_since
       AND NOT EXISTS (
             SELECT 1
               FROM public.talkx_conversions tc
              WHERE tc.source = 'deal'
                AND tc.external_ref = cp.external_id
           )
     ORDER BY cp.purchased_at, cp.id
  LOOP
    v_scanned := v_scanned + 1;

    -- Último toque: o envio mais recente ao MESMO contato, anterior à compra e
    -- dentro da janela. Uma compra conta para uma única campanha.
    SELECT r.id, r.campaign_id
      INTO v_recipient
      FROM public.talkx_recipients r
     WHERE r.contact_id = v_purchase.contact_id
       AND r.sent_at IS NOT NULL
       AND r.sent_at <= v_purchase.purchased_at
       AND r.sent_at >= v_purchase.purchased_at - (v_window_days || ' days')::interval
     ORDER BY r.sent_at DESC, r.id
     LIMIT 1;

    IF NOT FOUND THEN
      v_no_touch := v_no_touch + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_result := public.record_talkx_conversion(
        v_recipient.campaign_id,
        v_purchase.external_id,
        COALESCE(v_purchase.amount, 0),
        'deal',
        COALESCE(v_purchase.currency, 'BRL'),
        NULL,
        v_recipient.id,
        v_purchase.purchased_at,
        jsonb_build_object(
          'purchase_id', v_purchase.id,
          'recipient_id', v_recipient.id,
          'window_days', v_window_days
        )
      );
    EXCEPTION
      WHEN invalid_parameter_value OR check_violation THEN
        -- Uma compra inválida não pode travar o lote inteiro de atribuição.
        -- record_talkx_conversion usa SQLSTATE 22023 para valor negativo,
        -- valor acima de conversion_max_value e occurred_at no futuro.
        v_rejected := v_rejected + 1;
        CONTINUE;
    END;

    IF v_result ->> 'status' = 'recorded' THEN
      v_attributed := v_attributed + 1;
    ELSE
      v_duplicate := v_duplicate + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned',          v_scanned,
    'attributed',       v_attributed,
    'skipped_no_touch', v_no_touch,
    'duplicates',       v_duplicate,
    'rejected',         v_rejected,
    'since',            v_since,
    'window_days',      v_window_days
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_attribute_purchases(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_attribute_purchases(timestamptz) TO service_role;

-- ============================================================================
-- (6) talkx_campaign_revenue — conversões, receita, investimento e ROI
--     SECURITY INVOKER: a leitura de talkx_conversions/talkx_campaigns passa pela
--     RLS do chamador (dono da campanha / admin-supervisor).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_campaign_revenue(p_campaign uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH agg AS (
    SELECT count(*)::integer                    AS conversions,
           COALESCE(sum(value), 0)::numeric(14,2) AS revenue
      FROM public.talkx_conversions
     WHERE campaign_id = p_campaign
  )
  SELECT jsonb_build_object(
    'campaign_id', p_campaign,
    'conversions', agg.conversions,
    'revenue',     agg.revenue,
    'investment',  camp.investment,
    'roi', CASE
             WHEN camp.investment IS NOT NULL AND camp.investment > 0
             THEN round((agg.revenue - camp.investment) / camp.investment, 4)
           END,
    'roi_percent', CASE
             WHEN camp.investment IS NOT NULL AND camp.investment > 0
             THEN round(100 * (agg.revenue - camp.investment) / camp.investment, 2)
           END
  )
    FROM agg
    LEFT JOIN public.talkx_campaigns camp ON camp.id = p_campaign;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_revenue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_revenue(uuid) TO authenticated, service_role;
