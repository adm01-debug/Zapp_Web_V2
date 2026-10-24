DO $$
DECLARE rep text := ''; v int; q text;
  base text := ' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (''zapp'',''public'') AND p.prosecdef AND has_function_privilege(''authenticated'', p.oid, ''EXECUTE'') AND p.prorettype <> ''trigger''::regtype AND (p.proretset OR p.prorettype::regtype::text IN (''jsonb'',''json'',''record'')) ';
  dep text := ' AND EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace cn ON cn.oid=c.relnamespace WHERE d.classid=''pg_proc''::regclass AND d.objid=p.oid AND d.refclassid=''pg_class''::regclass AND (cn.nspname=''vault'' OR c.relname ~* ''(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|login_attempts|gmail_accounts)'')) ';
  g1 text := ' AND pg_get_functiondef(p.oid) !~* ''(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)'' ';
BEGIN
  q := 'SELECT count(*)' || base || dep; EXECUTE q INTO v; rep := rep || format('A js+dep_sensitive=%s', v) || E'\n';
  q := 'SELECT count(*)' || base || dep || g1; EXECUTE q INTO v; rep := rep || format('B js+dep_sensitive+noguard=%s', v) || E'\n';
  q := 'SELECT count(*)' || base; EXECUTE q INTO v; rep := rep || format('C js(312)=%s', v) || E'\n';
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
