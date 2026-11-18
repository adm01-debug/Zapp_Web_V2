CREATE OR REPLACE FUNCTION public.cleanup_crm_sync_outbox(p_succeeded_days integer DEFAULT 90, p_dead_letter_days integer DEFAULT 180, p_limit integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  WITH expired AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE (status = 'succeeded' AND completed_at < now() - make_interval(days => GREATEST(p_succeeded_days, 30)))
       OR (status = 'dead_letter' AND updated_at < now() - make_interval(days => GREATEST(p_dead_letter_days, 30)))
    ORDER BY COALESCE(completed_at, updated_at)
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.crm_sync_outbox q USING expired e WHERE q.id = e.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
