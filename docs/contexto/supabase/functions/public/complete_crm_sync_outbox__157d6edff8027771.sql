CREATE OR REPLACE FUNCTION public.complete_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_interaction_id text, p_contact_id text, p_company_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'succeeded', completed_at = now(), locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = NULL, external_interaction_id = p_interaction_id,
      external_contact_id = p_contact_id, external_company_id = p_company_id, updated_at = now()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_lease_lost' USING ERRCODE = 'P0002';
  END IF;
END;
$function$
