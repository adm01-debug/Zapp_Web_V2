CREATE OR REPLACE FUNCTION public.talkx_attribute_purchases(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
