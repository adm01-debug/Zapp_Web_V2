DO $$
DECLARE
  rep text := '';
  v int;
BEGIN
  -- A: total secdef in schemas
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef;
  rep := rep || format('A secdef_zapp_public=%s', v) || E'\n';

  -- B: with EXECUTE to authenticated (incl. default/PUBLIC)
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  rep := rep || format('B +exec_authenticated=%s', v) || E'\n';

  -- C: proacl explicitly names authenticated
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef
     AND p.proacl IS NOT NULL AND array_to_string(p.proacl, ',') LIKE '%authenticated=%';
  rep := rep || format('C proacl_named_authenticated=%s', v) || E'\n';

  -- D: B and proretset
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  rep := rep || format('D +proretset=%s', v) || E'\n';

  -- E: D and sensitive TABLE name token in body
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)';
  rep := rep || format('E proretset+sensitive_table=%s', v) || E'\n';

  -- F: E and no guard
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
     AND pg_get_functiondef(p.oid) !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)';
  rep := rep || format('F proretset+sensitive_table+noguard=%s', v) || E'\n';

  -- G: D and sensitive column token in body
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(phone|email|nome|cpf|documento|token|api_key|secret|content|message|payload|evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)';
  rep := rep || format('G proretset+sensitive_any=%s', v) || E'\n';

  -- H: G + no guard
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(phone|email|nome|cpf|documento|token|api_key|secret|content|message|payload|evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
     AND pg_get_functiondef(p.oid) !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)';
  rep := rep || format('H proretset+sensitive_any+noguard=%s', v) || E'\n';

  -- I: 130-ish check: B + sensitive table (no retset filter)
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)';
  rep := rep || format('I any+sensitive_table=%s', v) || E'\n';

  -- J: B + sensitive table + no guard
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND pg_get_functiondef(p.oid) ~* '(evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
     AND pg_get_functiondef(p.oid) !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)';
  rep := rep || format('J any+sensitive_table+noguard=%s', v) || E'\n';

  -- K: D but exclude trigger-returning
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.prorettype <> 'trigger'::regtype;
  rep := rep || format('K proretset_non_trigger=%s', v) || E'\n';

  -- L: H variant excluding trigger
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND p.proretset
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.prorettype <> 'trigger'::regtype
     AND pg_get_functiondef(p.oid) ~* '(phone|email|nome|cpf|documento|token|api_key|secret|content|message|payload|evolution_|profiles|contacts|cookies_config|cookie_probe_log|whatsapp_connections|vault[.]|login_attempts|gmail_accounts)'
     AND pg_get_functiondef(p.oid) !~* '(auth[.]uid|is_admin|is_supervisor|current_user_is_privileged|fn_require_app_user)';
  rep := rep || format('L non_trigger+any+noguard=%s', v) || E'\n';

  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
