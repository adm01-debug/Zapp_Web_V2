-- Manual links made from the Email sidebar are deliberately narrow: the Edge
-- proves the caller can see the Gmail thread/contact and is an administrator
-- or supervisor before invoking this service-role-only function.  Keeping the
-- write here makes that link auditable without granting table writes to agents.
CREATE OR REPLACE FUNCTION public.link_email_crm_contact_guarded(
  p_zapp_contact_id uuid,
  p_external_contact_id text,
  p_external_company_id text,
  p_normalized_phone text,
  p_linked_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing text;
  v_rows integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF length(p_external_contact_id) NOT BETWEEN 1 AND 200
     OR (p_external_company_id IS NOT NULL AND length(p_external_company_id) NOT BETWEEN 1 AND 200)
     OR (p_normalized_phone IS NOT NULL AND p_normalized_phone !~ '^[0-9]{8,15}$') THEN
    RAISE EXCEPTION 'invalid_crm_link' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.contacts WHERE id = p_zapp_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT external_contact_id INTO v_existing
  FROM public.crm_contact_links
  WHERE zapp_contact_id = p_zapp_contact_id
  FOR UPDATE;
  IF FOUND AND v_existing <> p_external_contact_id THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.crm_contact_links (
    zapp_contact_id, external_contact_id, external_company_id,
    normalized_phone, link_source, linked_by, linked_at, verified_at
  ) VALUES (
    p_zapp_contact_id, p_external_contact_id, p_external_company_id,
    p_normalized_phone, 'manual', p_linked_by, now(), now()
  )
  ON CONFLICT (zapp_contact_id) DO UPDATE SET
    external_company_id = EXCLUDED.external_company_id,
    normalized_phone = EXCLUDED.normalized_phone,
    linked_by = EXCLUDED.linked_by,
    linked_at = now(),
    verified_at = now()
  WHERE public.crm_contact_links.external_contact_id = EXCLUDED.external_contact_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_email_crm_contact_guarded(uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_email_crm_contact_guarded(uuid, text, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.link_email_crm_contact_guarded(uuid, text, text, text, uuid) IS
  'Persiste vinculo manual do sidebar Email somente via Edge service-role autorizada.';
