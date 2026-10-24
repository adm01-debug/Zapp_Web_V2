DO $$
DECLARE r record; rep text := ''; n int := 0; tabs text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proretset, p.prorettype::regtype::text AS ret,
           pg_get_functiondef(p.oid) AS def,
           p.proacl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp','public') AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND pg_get_functiondef(p.oid) ~* '(phone|email|nome|cpf|documento|token|api_key|secret|content|message|payload|evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
      AND pg_get_functiondef(p.oid) !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)'
    ORDER BY 1,2,3
  LOOP
    n := n + 1;
    SELECT string_agg(DISTINCT t, ',' ) INTO tabs FROM (
      SELECT regexp_replace(m[2], '^[a-z_]+[.]', '') AS t
      FROM regexp_matches(r.def, '(?i)(from|join)[[:space:]]+([a-z_][a-z0-9_]*[.][a-z_][a-z0-9_]*|[a-z_][a-z0-9_]*)', 'g') AS m
    ) s;
    rep := rep || format('%s|%s|%s(%s)|%s|%s|acl=%s|T:%s',
           n, r.sch, r.fn, r.args,
           CASE WHEN r.proretset THEN 'SETOF' ELSE 'SCALAR' END, r.ret,
           CASE WHEN r.proacl IS NULL THEN 'NULL' ELSE array_to_string(r.proacl,',') END,
           coalesce(tabs,'-')) || E'\n';
  END LOOP;
  RAISE EXCEPTION E'REPORT total=%\n%', n, rep;
END $$;
