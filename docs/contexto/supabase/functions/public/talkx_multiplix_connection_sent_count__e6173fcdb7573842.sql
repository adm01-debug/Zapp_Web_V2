CREATE OR REPLACE FUNCTION public.talkx_multiplix_connection_sent_count(p_connection_id uuid, p_since timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sent integer;
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';
  END IF;

  SELECT
    (SELECT count(*)
       FROM public.talkx_recipients AS recipient
       JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
      WHERE campaign.whatsapp_connection_id = p_connection_id
        AND recipient.sent_at IS NOT NULL
        AND recipient.sent_at >= p_since)
    +
    (SELECT count(*)
       FROM public.multiplix_delivery_items AS item
       JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
      WHERE dispatch.whatsapp_connection_id = p_connection_id
        AND item.sent_at IS NOT NULL
        AND item.sent_at >= p_since)
    +
    (SELECT count(*)
       FROM public.multiplix_recipients AS recipient
       JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
      WHERE dispatch.whatsapp_connection_id = p_connection_id
        AND recipient.sent_at IS NOT NULL
        AND recipient.sent_at >= p_since
        AND NOT EXISTS (
          SELECT 1
            FROM public.multiplix_delivery_items AS item
           WHERE item.recipient_id = recipient.id
             AND item.sent_at IS NOT NULL
        ))
    INTO v_sent;

  RETURN COALESCE(v_sent, 0);
END;
$function$
