CREATE OR REPLACE FUNCTION public.get_crm_sync_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'succeeded_24h', count(*) FILTER (
      WHERE status = 'succeeded' AND completed_at >= now() - interval '24 hours'
    ),
    'succeeded_without_link', count(*) FILTER (
      WHERE status = 'succeeded'
        AND (external_contact_id IS NULL OR contact_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.crm_contact_links l
          WHERE l.zapp_contact_id = crm_sync_outbox.contact_id
            AND l.external_contact_id = crm_sync_outbox.external_contact_id
        ))
    ),
    'oldest_ready_age_seconds', COALESCE(
      floor(extract(epoch FROM now() - min(created_at) FILTER (
        WHERE (status IN ('pending', 'failed') AND available_at <= now())
           OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )))::bigint,
      0
    ),
    'generated_at', now()
  ) INTO v_result
  FROM public.crm_sync_outbox;

  RETURN v_result;
END;
$function$
