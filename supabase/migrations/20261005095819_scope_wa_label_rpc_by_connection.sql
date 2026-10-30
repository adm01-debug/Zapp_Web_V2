-- scope_wa_label_rpc_by_connection
-- Rollback: DROP FUNCTION IF EXISTS public.rename_wa_label_on_all_contacts(uuid, text, text); DROP FUNCTION IF EXISTS public.remove_wa_label_from_all_contacts(uuid, text); CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_global_admin(); UPDATE public.contacts SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t), updated_at = now() WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%'); END; $function$; REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role; CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_global_admin(); UPDATE public.contacts SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now() WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%'); END; $function$; REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
-- Correção do item 22 (TRA-006, P1): renomear ou apagar label do WhatsApp operava
-- GLOBALMENTE, ignorando a instância. As RPCs `rename_wa_label_on_all_contacts` e
-- `remove_wa_label_from_all_contacts` faziam UPDATE em TODOS os contatos cujo array
-- `tags` batia com o prefixo `wa:<labelId>:` — sem filtro de conexão. Como o ID de
-- label é por instância (cada conta WhatsApp renumera seus rótulos de 0..N), renomear
-- ou apagar o label "5" na instância A atingia também os contatos da instância B que
-- tivessem um label "5" (homônimo, mas semanticamente outro).
--
-- A correção: as duas RPCs passam a receber o `p_connection_id` (o `id` da linha em
-- `whatsapp_connections`) e o UPDATE é escopado por `whatsapp_connection_id`. O
-- webhook `labels.edit` resolve a conexão pela instância (getConnectionByInstance) e
-- repassa o id. Se a instância não corresponder a conexão nenhuma, o evento é ignorado.
--
-- O Rollback (linha 2) recria as assinaturas antigas E restaura os REVOKE/GRANT
-- delas: sem isso o CREATE depois do DROP deixaria proacl NULL, ou seja EXECUTE
-- para PUBLIC — regressão reprovada por scripts/db-audit/check-secdef-public-execute.sql.

-- Remove as versões globais antigas (não podem coexistir como caminho sem escopo).
DROP FUNCTION IF EXISTS public.rename_wa_label_on_all_contacts(text, text);
DROP FUNCTION IF EXISTS public.remove_wa_label_from_all_contacts(text);

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
$function$;

REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(uuid, text, text) TO authenticated, service_role;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(uuid, text) TO authenticated, service_role;
