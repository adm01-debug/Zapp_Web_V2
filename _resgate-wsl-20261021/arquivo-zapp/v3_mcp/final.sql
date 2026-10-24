DO $do$
DECLARE r record; v_out text:='';
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='zapp' AND p.proname IN ('fn_cookie_health','fn_dashboard_data','get_reset_requests_safe','get_contact_notes','search_contacts','fn_export_messages','apagar_nota_fiscal','fn_edge_upsert_evolution_credentials','send_message_v2')
   ORDER BY 3,1
 LOOP
   v_out := v_out || r.ns||'.'||r.fn||' :: ' ||
     substr(regexp_replace(pg_get_functiondef(r.oid), '\s+', ' ', 'g'), 1, 700) || chr(10) || '=====' || chr(10);
 END LOOP;
 RAISE EXCEPTION 'FINAL %', v_out;
END $do$;
