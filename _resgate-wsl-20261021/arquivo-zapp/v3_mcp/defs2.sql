DO $do$
DECLARE r record; v_out text:='';
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.proname IN (
     'rpc_get_contact','rpc_list_contacts','rpc_list_messages_all','rpc_list_messages','rpc_list_messages_lite',
     'rpc_get_message_details','fn_export_messages','rpc_search_messages','search_contacts','search_contacts_advanced',
     'rpc_unified_search','fn_get_contact_summary','rpc_get_gmail_health_summary','fn_dashboard_data','rpc_global_search')
   ORDER BY 2,3
 LOOP
   v_out := v_out || r.ns||'.'||r.fn||'('||r.args||') >> ' ||
     substr(regexp_replace(pg_get_functiondef(r.oid), '\s+', ' ', 'g'), 1, 620) || chr(10) || '==========' || chr(10);
 END LOOP;
 RAISE EXCEPTION 'DEFS %', v_out;
END $do$;
