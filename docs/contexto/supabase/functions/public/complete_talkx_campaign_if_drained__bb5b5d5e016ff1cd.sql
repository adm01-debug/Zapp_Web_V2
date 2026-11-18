CREATE OR REPLACE FUNCTION public.complete_talkx_campaign_if_drained(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_resumo text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  SELECT campaign.status
    INTO v_status
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.talkx_recipients AS recipient
     WHERE recipient.campaign_id = p_campaign_id
       AND recipient.status IN ('pending', 'sending')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.talkx_campaigns
     SET status = 'completed',
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id
     AND status = 'sending';

  IF FOUND THEN
    -- X024: resumo no evento de conclusão (números finais).
    SELECT jsonb_build_object(
      'total', campaign.total_recipients,
      'sent', campaign.sent_count,
      'failed', campaign.failed_count,
      'delivered', campaign.delivered_count,
      'outcome_unknown', campaign.outcome_unknown_count,
      'cancelled', (
        SELECT count(*) FROM public.talkx_recipients recipient
         WHERE recipient.campaign_id = p_campaign_id
           AND recipient.status = 'cancelled'
      )
    )::text INTO v_resumo
    FROM public.talkx_campaigns campaign
    WHERE campaign.id = p_campaign_id;

    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (p_campaign_id, 'completed', v_resumo, NULL);
  END IF;

  RETURN FOUND;
END;
$function$
