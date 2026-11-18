CREATE OR REPLACE FUNCTION public.run_crm_sync_outbox_cleanup(p_succeeded_days integer DEFAULT 90, p_dead_letter_days integer DEFAULT 180, p_limit integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.crm_sync_outbox_cron_enabled() THEN RETURN 0; END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
  RETURN public.cleanup_crm_sync_outbox(p_succeeded_days,p_dead_letter_days,p_limit);
END;
$function$
