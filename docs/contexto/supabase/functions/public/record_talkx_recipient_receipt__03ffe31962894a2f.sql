CREATE OR REPLACE FUNCTION public.record_talkx_recipient_receipt(p_external_id text, p_connection_id uuid, p_event text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_delivered_at timestamptz;
  v_read_at timestamptz;
  v_external_id text := NULLIF(btrim(p_external_id), '');
  v_now timestamptz := statement_timestamp();
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
    SELECT recipient.id, recipient.campaign_id, recipient.delivered_at, recipient.read_at
      INTO STRICT v_recipient_id, v_campaign_id, v_delivered_at, v_read_at
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE recipient.external_id = v_external_id
       AND campaign.whatsapp_connection_id = p_connection_id
     FOR UPDATE OF recipient;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  -- Cada contador sobe uma única vez: o carimbo é a guarda de idempotência.
  IF p_event = 'read' THEN
    IF v_read_at IS NOT NULL THEN
      RETURN false;
    END IF;

    UPDATE public.talkx_recipients
       SET read_at = v_now,
           delivered_at = COALESCE(delivered_at, v_now),
           status = CASE WHEN delivered_at IS NULL AND status = 'sent' THEN 'delivered' ELSE status END,
           updated_at = v_now
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET read_count = campaign.read_count + 1,
           delivered_count = campaign.delivered_count + CASE WHEN v_delivered_at IS NULL THEN 1 ELSE 0 END,
           updated_at = v_now
     WHERE campaign.id = v_campaign_id;
  ELSE
    IF v_delivered_at IS NOT NULL THEN
      RETURN false;
    END IF;

    UPDATE public.talkx_recipients
       SET status = 'delivered',
           delivered_at = v_now,
           updated_at = v_now
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET delivered_count = campaign.delivered_count + 1,
           updated_at = v_now
     WHERE campaign.id = v_campaign_id;
  END IF;

  RETURN true;
END;
$function$
