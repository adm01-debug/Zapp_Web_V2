CREATE OR REPLACE FUNCTION public.record_talkx_conversion(p_campaign_id uuid, p_external_ref text, p_value numeric, p_source text, p_currency text DEFAULT 'BRL'::text, p_link_id uuid DEFAULT NULL::uuid, p_recipient_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT now(), p_attribution jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
