DROP FUNCTION IF EXISTS public.rename_wa_label_on_all_contacts(text, text)

DROP FUNCTION IF EXISTS public.remove_wa_label_from_all_contacts(text)

CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_connection_id uuid, p_label_prefix text, p_new_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE whatsapp_connection_id = p_connection_id
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$

REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(uuid, text, text) FROM PUBLIC

GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(uuid, text, text) TO authenticated, service_role

CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_connection_id uuid, p_label_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE whatsapp_connection_id = p_connection_id
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$

REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(uuid, text) FROM PUBLIC

GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(uuid, text) TO authenticated, service_role
