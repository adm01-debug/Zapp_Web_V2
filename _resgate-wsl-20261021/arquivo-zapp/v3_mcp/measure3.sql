DO $do$
DECLARE r record; v_n bigint; v_err text; v_out text := ''; v_sub uuid; v_claims text; v_out2 text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('OWN:zapp.evolution_contacts','SELECT count(*) FROM zapp.evolution_contacts'),
    ('OWN:zapp.evolution_messages','SELECT count(*) FROM zapp.evolution_messages'),
    ('OWN:zapp.evolution_messages_wpp2','SELECT count(*) FROM zapp.evolution_messages_wpp2'),
    ('OWN:zapp.profiles','SELECT count(*) FROM zapp.profiles'),
    ('OWN:zapp.contact_notes','SELECT count(*) FROM zapp.contact_notes'),
    ('OWN:public.contacts','SELECT count(*) FROM public.contacts'),
    ('OWN:zapp.cookie_probe_log','SELECT count(*) FROM zapp.cookie_probe_log'),
    ('OWN:zapp.cookies_config','SELECT count(*) FROM zapp.cookies_config'),
    ('OWN:zapp.evolution_notifications','SELECT count(*) FROM zapp.evolution_notifications'),
    ('OWN:zapp.contact_purchases','SELECT count(*) FROM zapp.contact_purchases'),
    ('OWN:zapp.evolution_instance_credentials','SELECT count(*) FROM zapp.evolution_instance_credentials'),
    ('OWN:zapp.login_attempts','SELECT count(*) FROM zapp.login_attempts'),
    ('OWN:zapp.password_reset_requests','SELECT count(*) FROM zapp.password_reset_requests'),
    ('OWN:vault.secrets','SELECT count(*) FROM vault.secrets'),
    ('OWN:zapp.contatos','SELECT count(*) FROM zapp.contatos'),
    ('OWN:zapp.empresas','SELECT count(*) FROM zapp.empresas'),
    ('OWN:zapp.gmail_accounts','SELECT count(*) FROM zapp.gmail_accounts'),
    ('OWN:sessao_atual_e_postgres','SELECT CASE WHEN session_user IN (''postgres'',''supabase_admin'') THEN 1 ELSE 0 END')
  ) v(fname, expr)
  LOOP
    BEGIN EXECUTE r.expr INTO v_n; v_err := NULL;
    EXCEPTION WHEN OTHERS THEN v_n := NULL; v_err := SQLERRM; END;
    v_out := v_out || r.fname || ' => ' || CASE WHEN v_err IS NULL THEN 'ok=' || v_n::text ELSE 'ERRO[' || left(v_err,60) || ']' END || chr(10);
  END LOOP;

  SELECT p.user_id INTO v_sub FROM zapp.profiles p JOIN zapp.user_roles ur ON ur.user_id=p.user_id
   WHERE ur.role::text IN ('agent','atendente','user','vendedor') LIMIT 1;
  v_claims := json_build_object('sub', v_sub, 'role','authenticated')::text;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  FOR r IN SELECT * FROM (VALUES
    ('NOAUTH:zapp.search_contacts','SELECT count(*) FROM zapp.search_contacts()'),
    ('NOAUTH:search_contacts_total_count','SELECT max(total_count) FROM zapp.search_contacts()'),
    ('NOAUTH:search_contacts_email_nao_nulo','SELECT count(*) FROM zapp.search_contacts() WHERE email IS NOT NULL'),
    ('NOAUTH:search_contacts_phone_nao_nulo','SELECT count(*) FROM zapp.search_contacts() WHERE phone IS NOT NULL'),
    ('NOAUTH:fn_cookie_health','SELECT count(*) FROM zapp.fn_cookie_health()'),
    ('NOAUTH:fn_cookie_health_preview','SELECT count(*) FROM zapp.fn_cookie_health() WHERE last_probe_preview IS NOT NULL'),
    ('NOAUTH:public.fn_search_contacts','SELECT count(*) FROM public.fn_search_contacts(NULL,100)'),
    ('NOAUTH:zapp.fn_search_contacts','SELECT count(*) FROM zapp.fn_search_contacts(NULL,100)'),
    ('NOAUTH:rpc_get_notifications','SELECT count(*) FROM zapp.rpc_get_notifications(50,true)'),
    ('NOAUTH:rpc_list_messages_lite_100k','SELECT count(*) FROM zapp.rpc_list_messages_lite((SELECT remote_jid FROM zapp.rpc_list_messages_all(NULL,NULL,NULL,NULL,NULL,NULL,1,0)),NULL,100000,0,NULL)'),
    ('NOAUTH:get_conversations_financeiro','SELECT length(zapp.fn_dashboard_data()::text)'),
    ('NOAUTH:zapp.rpc_list_messages_all_sem_sub','SELECT count(*) FROM zapp.rpc_list_messages_all(NULL,NULL,NULL,NULL,NULL,NULL,50000,0)')
  ) v(fname, expr)
  LOOP
    BEGIN EXECUTE r.expr INTO v_n; v_err := NULL;
    EXCEPTION WHEN OTHERS THEN v_n := NULL; v_err := SQLERRM; END;
    v_out2 := v_out2 || r.fname || ' => ' || CASE WHEN v_err IS NULL THEN 'ok=' || v_n::text ELSE 'ERRO[' || left(v_err,60) || ']' END || chr(10);
  END LOOP;

  PERFORM set_config('request.jwt.claims', v_claims, true);
  FOR r IN SELECT * FROM (VALUES
    ('AGENT:zapp.profiles_direto','SELECT count(*) FROM zapp.profiles'),
    ('AGENT:zapp.evolution_contacts_direto','SELECT count(*) FROM zapp.evolution_contacts'),
    ('AGENT:zapp.evolution_messages_direto','SELECT count(*) FROM zapp.evolution_messages'),
    ('AGENT:zapp.contact_notes_direto','SELECT count(*) FROM zapp.contact_notes'),
    ('AGENT:zapp.cookies_config_direto','SELECT count(*) FROM zapp.cookies_config'),
    ('AGENT:zapp.cookie_probe_log_direto','SELECT count(*) FROM zapp.cookie_probe_log'),
    ('AGENT:zapp.evolution_notifications_direto','SELECT count(*) FROM zapp.evolution_notifications'),
    ('AGENT:zapp.contact_purchases_direto','SELECT count(*) FROM zapp.contact_purchases'),
    ('AGENT:rpc_list_contacts','SELECT count(*) FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,100000,0)'),
    ('AGENT:rpc_list_contacts_email','SELECT count(*) FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,100000,0) WHERE email IS NOT NULL'),
    ('AGENT:rpc_list_messages_all','SELECT count(*) FROM zapp.rpc_list_messages_all(NULL,NULL,NULL,NULL,NULL,NULL,100000,0)')
  ) v(fname, expr)
  LOOP
    BEGIN EXECUTE r.expr INTO v_n; v_err := NULL;
    EXCEPTION WHEN OTHERS THEN v_n := NULL; v_err := SQLERRM; END;
    v_out2 := v_out2 || r.fname || ' => ' || CASE WHEN v_err IS NULL THEN 'ok=' || v_n::text ELSE 'ERRO[' || left(v_err,60) || ']' END || chr(10);
  END LOOP;
  RESET ROLE;
  RAISE EXCEPTION 'MEASURE3 % || %', v_out, v_out2;
END $do$;
