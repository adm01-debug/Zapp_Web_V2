-- Migration: 20260927430000
-- Fase 1 do plano de seguranca (50 etapas)
-- BLOCO 1: REVOKE EXECUTE FROM PUBLIC para as 9 funcoes expostas
REVOKE EXECUTE ON FUNCTION public.accept_department_invite(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_team_conversation_previews() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_team_unread_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;

-- BLOCO 2: GRANT explicito para authenticated e service_role
GRANT EXECUTE ON FUNCTION public.accept_department_invite(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_conversation_previews() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_unread_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;

-- BLOCO 3: Recriar as 4 funcoes wa_tag com search_path fixo e guard de auth
-- CREATE OR REPLACE reseta GRANTs; BLOCO 4 re-aplica.

CREATE OR REPLACE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%') || ARRAY[p_tag],
      updated_at = now()
  WHERE id = p_contact_id AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now()
  WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%');
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$$;

-- BLOCO 4: Re-aplicar GRANTs apos CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;
