-- P1: Segunda leva — adiciona pg_temp ao search_path de TODAS as funções
-- SECURITY DEFINER restantes (121 funções, batch dinâmico via DO block)
--
-- Após a primeira leva (20261016170000) com 15 funções P0/P1, e a correção
-- das 4 funções com search_path="" (handle_message_gamification etc.), restavam
-- 121 funções com search_path=public sem pg_temp.
--
-- O DO block usa pg_get_function_identity_arguments para gerar os ALTER FUNCTION
-- exatos sem precisar listar manualmente cada assinatura.
--
-- Rollback: executar o mesmo DO substituindo 'public, pg_temp' por 'public'

DO $$
DECLARE
  r record;
  already_fixed text[] := ARRAY[
    'mcp_exec', 'mcp_exec_many', 'effective_role', 'get_channel_credentials',
    'get_channel_credentials_safe', 'get_department_whatsapp_api_key',
    'get_department_whatsapp_credentials', 'get_gmail_tokens',
    'get_profile_role_for_check', 'handle_new_user_role', 'has_role',
    'is_admin', 'is_admin_or_supervisor', 'store_gmail_tokens', 'user_has_permission',
    'handle_message_gamification', 'prevent_contact_assignee_hijack',
    'prevent_contact_queue_hijack', 'resolve_contact_guard_actor'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') LIKE '%pg_temp%')
      AND NOT p.proname = ANY(already_fixed)
    ORDER BY p.proname
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      r.proname, r.args
    );
  END LOOP;
END;
$$;
