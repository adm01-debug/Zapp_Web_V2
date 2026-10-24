DO $do$
DECLARE r record; v_def text; v_body text; v_gt text; v_out text:=''; v_n int:=0;
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.proname IN (
     'search_contacts','search_contacts_advanced','fn_cookie_health','rpc_list_contacts','rpc_list_messages_all',
     'rpc_list_messages_lite','rpc_global_search','rpc_unified_search','rpc_resolve_instance_by_phone',
     'rpc_resolve_whatsapp_instance','rpc_find_contact_by_phone','get_companies_by_phones_batch','get_team_profiles',
     'fn_get_deleted_messages','get_contact_notes','fn_get_contact_summary','rpc_get_gmail_health_summary',
     'fn_edge_get_evolution_credentials','get_reset_requests_safe','export_user_data','get_profile_role_for_check',
     'rpc_instance_stats','get_duplicate_report','get_segment_contacts','rpc_search_messages','admin_listar_usuarios_painel',
     'rpc_contact_stats','fn_export_messages','get_avatars_by_jids_batch','rpc_dr_health_check','fn_contact_ranking')
   ORDER BY 2,3,4
 LOOP
   v_def := pg_get_functiondef(r.oid);
   v_body := substr(regexp_replace(split_part(v_def, 'AS $function$', 2), '\s+', ' ', 'g'), 1, 200);
   SELECT string_agg(DISTINCT m[1], ',') INTO v_gt FROM regexp_matches(v_def,
     '(auth\.uid|auth\.jwt|auth\.role|is_admin[a-z_]*|is_supervisor|current_user_is_privileged|fn_require_app_user|has_role|is_manager_or_above|session_user|service_role|RAISE [A-Z]+)','g') m;
   v_n := v_n+1;
   v_out := v_out || v_n||'. '||r.ns||'.'||r.fn||'('||r.args||') TOKENS['||coalesce(v_gt,'NENHUM')||'] BODY:'||v_body||chr(10);
 END LOOP;
 RAISE EXCEPTION 'EVID %', v_out;
END $do$;
