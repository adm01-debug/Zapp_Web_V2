-- Migration: 20260927430000
-- Fase 1 do plano de seguranca (50 etapas)
-- DESCOBERTA: Supabase usa DEFAULT PRIVILEGES direto para anon/authenticated/service_role,
-- nao via PUBLIC. REVOKE FROM PUBLIC e no-op aqui. Fix: REVOKE direto de anon.

-- BLOCO 1: REVOKE EXECUTE FROM anon nas 9 RPCs de negocio
-- (authenticated e service_role continuam com acesso)
REVOKE EXECUTE ON FUNCTION public.accept_department_invite(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_conversation_previews() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_unread_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM anon;

-- BLOCO 2: Garantir GRANT explícito para authenticated e service_role
-- (já existem via DEFAULT PRIVILEGES, mas explicitamos para clareza)
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
-- NOTA: Apos CREATE OR REPLACE, DEFAULT PRIVILEGES re-aplicam anon=X.
-- Por isso BLOCO 4 inclui REVOKE de anon de novo.

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

-- BLOCO 4: Re-aplicar REVOKE de anon apos CREATE OR REPLACE
-- (DEFAULT PRIVILEGES re-concede anon=X automaticamente)
REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM anon;

-- Re-aplicar GRANTs apos CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;
