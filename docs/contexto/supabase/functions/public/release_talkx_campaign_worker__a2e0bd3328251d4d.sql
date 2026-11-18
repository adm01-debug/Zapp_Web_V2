CREATE OR REPLACE FUNCTION public.release_talkx_campaign_worker(p_campaign_id uuid, p_worker text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL
     OR p_worker IS NULL OR btrim(p_worker) = '' THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_release' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.talkx_worker_write', 'on', true);

  UPDATE public.talkx_campaigns AS campaign
  SET worker_id               = NULL,
      worker_lease_expires_at = NULL,
      updated_at              = statement_timestamp()
  WHERE campaign.id = p_campaign_id
    AND campaign.worker_id = p_worker;

  RETURN FOUND;
END;
$function$
