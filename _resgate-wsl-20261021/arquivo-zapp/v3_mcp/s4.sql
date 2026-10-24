DO $$
DECLARE rep text := ''; v int; q text;
  base text := ' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (''zapp'',''public'') AND p.prosecdef AND has_function_privilege(''authenticated'', p.oid, ''EXECUTE'') ';
  g text := ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)'' ';
  tbl text := ' AND pg_get_functiondef(p.oid) ~* ''(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'' ';
  col text := ' AND pg_get_functiondef(p.oid) ~* ''(phone|email|cpf|documento|token|api_key|secret|content|message|payload)'' ';
  nt text := ' AND p.prorettype <> ''trigger''::regtype ';
  js text := ' AND (p.proretset OR p.prorettype::regtype::text IN (''jsonb'',''json'',''record'')) ';
BEGIN
  q := 'SELECT count(*)' || base || nt || g || col;
  EXECUTE q INTO v; rep := rep || format('1 nonTrig+col+noguard=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || nt || g || js || col;
  EXECUTE q INTO v; rep := rep || format('2 nonTrig+js+col+noguard=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || nt || g || js || tbl;
  EXECUTE q INTO v; rep := rep || format('3 nonTrig+js+tbl+noguard=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || nt || js || col;
  EXECUTE q INTO v; rep := rep || format('4 nonTrig+js+col=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || nt || js;
  EXECUTE q INTO v; rep := rep || format('5 nonTrig+js(all)=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || js;
  EXECUTE q INTO v; rep := rep || format('6 js incl trigger=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || g || col;
  EXECUTE q INTO v; rep := rep || format('7 all+col+noguard=%s', v) || E'\n';
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
