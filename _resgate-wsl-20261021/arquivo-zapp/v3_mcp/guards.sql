DO $do$
DECLARE r record; v_out text:='';
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.proname IN (
     'fn_require_app_user','is_admin_painel','is_admin_or_supervisor','current_user_is_privileged',
     'is_privileged','fn_current_role','can_supervise_profile','fn_normalize_br_phone','is_supervisor')
   ORDER BY 2,3
 LOOP
   v_out := v_out || r.ns||'.'||r.fn||'('||r.args||') >> ' ||
     substr(regexp_replace(pg_get_functiondef(r.oid), '\s+', ' ', 'g'), 1, 500) || chr(10) || '==========' || chr(10);
 END LOOP;
 RAISE EXCEPTION 'GUARDS %', v_out;
END $do$;
