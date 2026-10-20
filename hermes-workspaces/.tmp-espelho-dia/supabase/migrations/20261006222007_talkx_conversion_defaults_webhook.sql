-- talkx_conversion_defaults_webhook
-- Rollback: CREATE OR REPLACE FUNCTION public.record_talkx_conversion(
-- Rollback:   p_campaign_id   uuid,
-- Rollback:   p_external_ref  text,
-- Rollback:   p_value         numeric,
-- Rollback:   p_source        text,
-- Rollback:   p_currency      text DEFAULT 'BRL',
-- Rollback:   p_link_id       uuid DEFAULT NULL,
-- Rollback:   p_recipient_id  uuid DEFAULT NULL,
-- Rollback:   p_occurred_at   timestamptz DEFAULT now(),
-- Rollback:   p_attribution   jsonb DEFAULT NULL
-- Rollback: )
-- Rollback: RETURNS jsonb
-- Rollback: LANGUAGE plpgsql
-- Rollback: SECURITY DEFINER
-- Rollback: SET search_path = public, pg_temp
-- Rollback: AS $function$
-- Rollback: DECLARE
-- Rollback:   v_max_value     numeric;
-- Rollback:   v_link_campaign uuid;
-- Rollback:   v_id            uuid;
-- Rollback: BEGIN
-- Rollback:   IF auth.role() IS DISTINCT FROM 'service_role' THEN
-- Rollback:     RAISE EXCEPTION 'talkx_conversion_service_role_only' USING ERRCODE = '42501';
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   v_max_value := COALESCE(
-- Rollback:     (SELECT (value #>> '{}')::numeric FROM public.talkx_settings WHERE key = 'conversion_max_value'),
-- Rollback:     100000
-- Rollback:   );
-- Rollback:
-- Rollback:   IF p_value < 0 THEN
-- Rollback:     RAISE EXCEPTION 'talkx_conversion_value_negative' USING ERRCODE = '22023';
-- Rollback:   END IF;
-- Rollback:   IF p_value > v_max_value THEN
-- Rollback:     RAISE EXCEPTION 'talkx_conversion_value_exceeds_max' USING ERRCODE = '22023';
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   IF p_source NOT IN ('whatsapp','manual','import','api','checkout') THEN
-- Rollback:     RAISE EXCEPTION 'talkx_conversion_invalid_source' USING ERRCODE = '22023';
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   IF p_link_id IS NOT NULL THEN
-- Rollback:     SELECT campaign_id INTO v_link_campaign FROM public.talkx_links WHERE id = p_link_id;
-- Rollback:     IF v_link_campaign IS DISTINCT FROM p_campaign_id THEN
-- Rollback:       RAISE EXCEPTION 'talkx_conversion_link_campaign_mismatch' USING ERRCODE = '23503';
-- Rollback:     END IF;
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   IF p_occurred_at > now() + interval '1 hour' THEN
-- Rollback:     RAISE EXCEPTION 'talkx_conversion_occurred_at_in_future' USING ERRCODE = '22023';
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   INSERT INTO public.talkx_conversions
-- Rollback:     (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution)
-- Rollback:   VALUES
-- Rollback:     (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, p_occurred_at, p_currency, p_attribution)
-- Rollback:   ON CONFLICT (campaign_id, source, external_ref) WHERE external_ref IS NOT NULL AND source IS NOT NULL
-- Rollback:   DO NOTHING
-- Rollback:   RETURNING id INTO v_id;
-- Rollback:
-- Rollback:   IF v_id IS NULL THEN
-- Rollback:     RETURN jsonb_build_object('status', 'duplicate');
-- Rollback:   END IF;
-- Rollback:
-- Rollback:   RETURN jsonb_build_object('status', 'recorded', 'id', v_id);
-- Rollback: END;
-- Rollback: $function$;
-- Rollback: REVOKE ALL ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
-- Rollback: GRANT EXECUTE ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) TO service_role;
--
-- #210 (R2-API-036): a conversão do endpoint talkx-link entrega defaults que a
-- RPC recusava. Quando o corpo omite os campos opcionais, a Edge envia
-- currency/occurred_at como NULL EXPLÍCITO (com origem válida 'api'); o NULL
-- explícito anulava os defaults da assinatura ('BRL' / now()) e colidia com o
-- NOT NULL das colunas. Resultado: uma conversão conforme o contrato do
-- endpoint falhava antes de gravar.
--
-- Esta migration faz a RPC aceitar o NULL explícito aplicando os defaults
-- internamente, via COALESCE (v_currency/v_occurred_at) — o default deixa de
-- depender de o argumento ser omitido. A lista de origens válidas NÃO muda:
-- o CHECK talkx_conversions_source_check e a allowlist da RPC seguem os da
-- X021 ('whatsapp','manual','import','api','checkout'); a Edge para de enviar
-- 'webhook' fixo e passa a mandar uma origem da lista.
--
-- Não há UPDATE/DELETE de dados e nenhum DDL fora da função: a migration só
-- recria a RPC e reafirma a ACL por assinatura exata. Por isso o rollback
-- também não toca em dado nenhum — só restaura o corpo anterior da função
-- (versão X021, sem os COALESCEs) e a mesma ACL.
--
-- RPC: defaults internos para currency/occurred_at com NULL explícito --------
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
  v_currency      text;
  v_occurred_at   timestamptz;
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

  IF p_source NOT IN ('whatsapp','manual','import','api','checkout') THEN
    RAISE EXCEPTION 'talkx_conversion_invalid_source' USING ERRCODE = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT campaign_id INTO v_link_campaign FROM public.talkx_links WHERE id = p_link_id;
    IF v_link_campaign IS DISTINCT FROM p_campaign_id THEN
      RAISE EXCEPTION 'talkx_conversion_link_campaign_mismatch' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- #210: NULL explícito (o chamador manda os campos opcionais sempre) cai no
  -- mesmo default que a assinatura daria se o argumento fosse omitido.
  v_currency    := COALESCE(p_currency, 'BRL');
  v_occurred_at := COALESCE(p_occurred_at, now());

  IF v_occurred_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'talkx_conversion_occurred_at_in_future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.talkx_conversions
    (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution)
  VALUES
    (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, v_occurred_at, v_currency, p_attribution)
  ON CONFLICT (campaign_id, source, external_ref) WHERE external_ref IS NOT NULL AND source IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  RETURN jsonb_build_object('status', 'recorded', 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) TO service_role;
