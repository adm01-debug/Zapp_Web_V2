DO $do$
DECLARE r record; v_out text:='';
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.proname IN (
     'fn_edge_get_evolution_credentials','rpc_dr_health_check','rpc_resolve_instance_by_phone',
     'rpc_resolve_whatsapp_instance','fn_health_preflight','fn_system_health_score','fn_cookie_health',
     'fn_contact_ranking','find_duplicate_contacts','rpc_find_contact_by_phone','get_companies_by_phones_batch',
     'get_segment_contacts','admin_listar_usuarios_painel','get_reset_requests_safe','get_team_profiles')
   ORDER BY 2,3
 LOOP
   v_out := v_out || r.ns||'.'||r.fn||'('||r.args||') >> ' ||
     substr(regexp_replace(pg_get_functiondef(r.oid), '\s+', ' ', 'g'), 1, 620) || chr(10) || '==========' || chr(10);
 END LOOP;
 RAISE EXCEPTION 'DEFS %', v_out;
END $do$;
