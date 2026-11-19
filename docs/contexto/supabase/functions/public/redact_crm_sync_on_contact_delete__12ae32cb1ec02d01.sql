CREATE OR REPLACE FUNCTION public.redact_crm_sync_on_contact_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'dead_letter',
      normalized_phone = NULL,
      payload = jsonb_build_object(
        'redacted', true,
        'reason', 'CONTACT_DELETED',
        'original_sha256', encode(digest(payload::text, 'sha256'), 'hex')
      ),
      locked_at = NULL,
      locked_by = NULL,
      lease_token = NULL,
      last_error_code = 'CONTACT_DELETED',
      external_interaction_id = NULL,
      external_contact_id = NULL,
      external_company_id = NULL,
      updated_at = now()
  WHERE contact_id = OLD.id;
  RETURN OLD;
END;
$function$
