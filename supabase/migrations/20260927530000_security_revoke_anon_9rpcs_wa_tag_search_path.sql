REVOKE EXECUTE ON FUNCTION public.accept_department_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_department_invite(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_team_conversation_previews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_conversation_previews() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_team_unread_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_unread_counts() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%') || ARRAY[p_tag],
      updated_at = now()
  WHERE id = p_contact_id AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now()
  WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role
