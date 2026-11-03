CREATE OR REPLACE FUNCTION public.kick_talkx_campaign(p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status      text;
  v_send_url    text;
  v_anon_key    text;
  v_cron_secret text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  -- Só campanha em envio é re-invocada; a leitura confirma também que existe.
  SELECT campaign.status
    INTO v_status
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id;
  IF NOT FOUND OR v_status <> 'sending' THEN
    RETURN;
  END IF;

  v_send_url := public.get_talkx_send_url();
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key' LIMIT 1;
  v_cron_secret := public.get_talkx_cron_secret();

  IF v_send_url IS NULL OR v_anon_key IS NULL OR v_cron_secret IS NULL THEN
    RETURN; -- sem rota/credencial configuradas não há como re-invocar a edge
  END IF;

  PERFORM net.http_post(
    url := v_send_url,
    body := jsonb_build_object('campaignId', p_campaign_id::text, 'action', 'continue'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-cron-secret', v_cron_secret
    ),
    timeout_milliseconds := 30000
  );
END;
$function$
