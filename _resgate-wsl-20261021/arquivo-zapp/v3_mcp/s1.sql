DO $$
DECLARE r record; rep text := ''; n int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proretset, p.prorettype::regtype::text AS ret,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp','public') AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY 1,2,3
  LOOP
    IF r.def ~* '(phone|email|nome|cpf|documento|token|api_key|secret|content|message|payload|evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
       AND r.def !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)'
    THEN
      n := n + 1;
      rep := rep || format('%s|%s|%s(%s)|%s|%s|len=%s', n, r.sch, r.fn, r.args,
             CASE WHEN r.proretset THEN 'SETOF' ELSE 'SCALAR' END, r.ret, length(r.def)) || E'\n';
    END IF;
  END LOOP;
  RAISE EXCEPTION E'REPORT total=%\n%', n, rep;
END $$;
