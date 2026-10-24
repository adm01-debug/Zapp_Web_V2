DO $$
DECLARE rep text := ''; v int; q text;
  base text := ' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (''zapp'',''public'') AND p.prosecdef AND has_function_privilege(''authenticated'', p.oid, ''EXECUTE'') AND p.prorettype <> ''trigger''::regtype AND (p.proretset OR p.prorettype::regtype::text IN (''jsonb'',''json'',''record'')) ';
  tbl text := ' AND pg_get_functiondef(p.oid) ~* ''(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'' ';
  g1 text := ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)'' ';
  g2 text := ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user|admin|role|permission|jwt|assert|_require)'' ';
BEGIN
  q := 'SELECT count(*)' || base || tbl; EXECUTE q INTO v; rep := rep || format('8 js+tbl(no guard filter)=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || tbl || g1; EXECUTE q INTO v; rep := rep || format('9 js+tbl+guardlist1=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || tbl || g2; EXECUTE q INTO v; rep := rep || format('10 js+tbl+guardlist2=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || tbl || ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user|has_role|admin)''';
  EXECUTE q INTO v; rep := rep || format('11 g1+has_role=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || tbl || ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user|has_role|admin|is_agent|is_member|owns|owner)''';
  EXECUTE q INTO v; rep := rep || format('12 g1+more=%s', v) || E'\n';
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
