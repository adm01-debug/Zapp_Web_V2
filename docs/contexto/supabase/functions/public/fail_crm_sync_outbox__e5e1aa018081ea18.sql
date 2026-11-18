CREATE OR REPLACE FUNCTION public.fail_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_error_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows integer;
  v_terminal boolean := p_error_code IN ('CRM_CONTACT_DELETED', 'CRM_IDENTITY_MISMATCH');
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = CASE WHEN v_terminal OR attempt_count >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
      available_at = now() + make_interval(secs => LEAST(
        3600, (power(2, GREATEST(0, LEAST(attempt_count, 10) - 1)) * 30)::integer
      )),
      locked_at = NULL, locked_by = NULL, lease_token = NULL,
      last_error_code = left(p_error_code, 100), updated_at = now()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_lease_lost' USING ERRCODE = 'P0002';
  END IF;
END;
$function$
