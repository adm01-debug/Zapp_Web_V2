CREATE OR REPLACE FUNCTION public.claim_talkx_campaign_worker(p_campaign_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_claim' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND OR v_campaign.status <> 'sending' THEN
    RETURN false;
  END IF;

  -- Lease vivo de OUTRO worker: recusa. Para o próprio, sempre renova.
  IF v_campaign.worker_id IS NOT NULL
     AND v_campaign.worker_id IS DISTINCT FROM p_worker
     AND v_campaign.worker_lease_expires_at IS NOT NULL
     AND v_campaign.worker_lease_expires_at > statement_timestamp() THEN
    RETURN false;
  END IF;

  -- Escape hatch do gatilho: só a RPC de lease escreve as colunas de worker.
  PERFORM set_config('app.talkx_worker_write', 'on', true);

  UPDATE public.talkx_campaigns AS campaign
  SET worker_id                = p_worker,
      worker_lease_expires_at  = statement_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at               = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  RETURN true;
END;
$function$
