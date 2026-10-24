DO $do$
DECLARE r record; v_def text; v_ret text;
  n_def_all int:=0; n_def_zp int:=0; n_authexec int:=0; n_reader int:=0; n_reader_sens int:=0; n_reader_sens_ng int:=0;
  n_sens_any int:=0; n_proc_schemas text;
BEGIN
  SELECT count(*) INTO n_def_all FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast');
  SELECT string_agg(DISTINCT n.nspname, ',') INTO n_proc_schemas FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast');
  FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_result(p.oid) ret,
             EXISTS(SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%') aexec
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','public') AND p.prosecdef ORDER BY 2,3
  LOOP
    n_def_zp := n_def_zp+1;
    IF NOT r.aexec THEN CONTINUE; END IF;
    n_authexec := n_authexec+1;
    v_ret := r.ret;
    IF NOT (v_ret LIKE 'TABLE(%' OR v_ret LIKE 'SETOF %' OR v_ret LIKE 'json%' OR v_ret='record') THEN CONTINUE; END IF;
    n_reader := n_reader+1;
    v_def := pg_get_functiondef(r.oid);
    CONTINUE WHEN v_def !~* '\y(evolution_contacts|evolution_messages|evolution_instance_credentials|cookies_config|cookie_probe_log|evolution_notifications|contact_purchases|password_reset_requests|login_attempts|gmail_accounts|whatsapp_connections|contacts|profiles|contatos|empresas|decrypted_secrets|evolution_conversations_financeiro)\y';
    n_reader_sens := n_reader_sens+1;
    CONTINUE WHEN v_def ~* '(is_admin|is_supervisor|is_privileged|is_manager_or_above|fn_require_app_user|auth\.uid)\y';
    n_reader_sens_ng := n_reader_sens_ng+1;
  END LOOP;
  RAISE EXCEPTION 'TOT definer_all_schemas=% schemas=% definer_zapp_public=% authexec=% readers=% readers_sensiveis=% readers_sensiveis_sem_qualquer_guarda=%',
    n_def_all, n_proc_schemas, n_def_zp, n_authexec, n_reader, n_reader_sens, n_reader_sens_ng;
END $do$;
