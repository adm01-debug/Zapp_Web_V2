CREATE OR REPLACE FUNCTION public.talkx_set_campaign_investment(p_campaign_id uuid, p_investment numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_investment_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_investment < 0 THEN
    RAISE EXCEPTION 'talkx_investment_negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_investment_campaign_not_found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.talkx_campaigns
     SET investment = p_investment, updated_at = now()
   WHERE id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'investment_updated', v_actor, p_investment::text);

  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'investment', p_investment);
END;
$function$
