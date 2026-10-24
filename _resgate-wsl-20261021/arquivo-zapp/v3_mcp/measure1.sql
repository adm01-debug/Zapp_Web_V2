DO $do$
DECLARE
  r record; v_n bigint; v_err text; v_out text := ''; v_txt text;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  FOR r IN SELECT * FROM (VALUES
    ('D:zapp.evolution_contacts','SELECT count(*) FROM zapp.evolution_contacts'),
    ('D:zapp.evolution_messages','SELECT count(*) FROM zapp.evolution_messages'),
    ('D:zapp.password_reset_requests','SELECT count(*) FROM zapp.password_reset_requests'),
    ('D:zapp.contact_notes','SELECT count(*) FROM zapp.contact_notes'),
    ('D:zapp.profiles','SELECT count(*) FROM zapp.profiles'),
    ('D:zapp.login_attempts','SELECT count(*) FROM zapp.login_attempts'),
    ('D:zapp.cookies_config','SELECT count(*) FROM zapp.cookies_config'),
    ('D:zapp.cookie_probe_log','SELECT count(*) FROM zapp.cookie_probe_log'),
    ('D:zapp.evolution_notifications','SELECT count(*) FROM zapp.evolution_notifications'),
    ('D:zapp.evolution_instance_credentials','SELECT count(*) FROM zapp.evolution_instance_credentials'),
    ('D:zapp.contact_purchases','SELECT count(*) FROM zapp.contact_purchases'),
    ('D:zapp.ordens_compra','SELECT count(*) FROM zapp.ordens_compra'),
    ('D:public.contacts','SELECT count(*) FROM public.contacts'),
    ('D:zapp.gmail_accounts','SELECT count(*) FROM zapp.gmail_accounts'),
    ('SUB:existe_profile_do_sub','SELECT count(*) FROM zapp.profiles WHERE user_id=''00000000-0000-4000-8000-000000000001'''),
    ('FIX:fn_contact_ranking','SELECT count(*) FROM zapp.fn_contact_ranking(50)'),
    ('FIX:rpc_dr_health_check','SELECT length(zapp.rpc_dr_health_check()::text)'),
    ('FIX:fn_cookie_health','SELECT count(*) FROM zapp.fn_cookie_health()'),
    ('FIX:rpc_get_notifications','SELECT count(*) FROM zapp.rpc_get_notifications(50,true)'),
    ('A:get_reset_requests_safe','SELECT count(*) FROM zapp.get_reset_requests_safe()'),
    ('A:search_contacts','SELECT count(*) FROM zapp.search_contacts()'),
    ('A:get_compliance_metrics','SELECT count(*) FROM zapp.get_compliance_metrics(NULL)'),
    ('A:get_contact_notes(nulo)','SELECT count(*) FROM zapp.get_contact_notes(NULL,10)'),
    ('A:fn_call_stats','SELECT count(*) FROM zapp.fn_call_stats(7)'),
    ('A:fn_baileys_logout_metrics','SELECT count(*) FROM zapp.fn_baileys_logout_metrics(7)'),
    ('A:fn_circuit_status','SELECT count(*) FROM zapp.fn_circuit_status()'),
    ('A:fn_wal_slot_lag_check','SELECT count(*) FROM zapp.fn_wal_slot_lag_check(100)'),
    ('A:rpc_instance_auth_event_summary','SELECT count(*) FROM zapp.rpc_instance_auth_event_summary(NULL)'),
    ('A:rpc_get_pipeline_health_v2','SELECT count(*) FROM zapp.rpc_get_pipeline_health_v2(NULL)'),
    ('A:fn_zapp_web_smoke_test_v2','SELECT count(*) FROM zapp.fn_zapp_web_smoke_test_v2()'),
    ('A:rpc_refresh_metrics','SELECT count(*) FROM zapp.rpc_refresh_metrics(NULL)'),
    ('A:fn_message_rate_5min','SELECT count(*) FROM zapp.fn_message_rate_5min()'),
    ('A:fn_connection_drift_summary','SELECT count(*) FROM zapp.fn_connection_drift_summary()'),
    ('A:rpc_queue_goal_metrics','SELECT count(*) FROM zapp.rpc_queue_goal_metrics()'),
    ('L:fn_system_health_score','SELECT length(zapp.fn_system_health_score()::text)'),
    ('L:fn_health_preflight','SELECT length(zapp.fn_health_preflight()::text)'),
    ('L:fn_dashboard_data','SELECT length(zapp.fn_dashboard_data()::text)'),
    ('L:rpc_get_gmail_health_summary','SELECT length(zapp.rpc_get_gmail_health_summary()::text)'),
    ('L:fn_attendance_report','SELECT length(zapp.fn_attendance_report(''2000-01-01'',''2030-12-31'')::text)'),
    ('L:get_contact_stats','SELECT length(zapp.get_contact_stats(NULL)::text)'),
    ('L:fn_zapp_web_system_health','SELECT length(zapp.fn_zapp_web_system_health()::text)'),
    ('L:get_platform_health','SELECT length(zapp.get_platform_health(NULL,30)::text)'),
    ('L:fn_get_live_metrics','SELECT length(zapp.fn_get_live_metrics()::text)'),
    ('L:get_lgpd_compliance_stats','SELECT length(zapp.get_lgpd_compliance_stats(NULL)::text)'),
    ('L:fn_agent_metrics','SELECT length(zapp.fn_agent_metrics()::text)'),
    ('L:rpc_pipeline_dashboard','SELECT length(zapp.rpc_pipeline_dashboard()::text)'),
    ('L:rpc_search_insights','SELECT length(zapp.rpc_search_insights(7)::text)'),
    ('L:rpc_contract_inventory','SELECT length(zapp.rpc_contract_inventory()::text)'),
    ('L:fn_get_evolution_health_summary','SELECT length(zapp.fn_get_evolution_health_summary()::text)'),
    ('L:fn_audit_storage_orphans','SELECT count(*) FROM zapp.fn_audit_storage_orphans(NULL,30,10)'),
    ('L:fn_list_shared_links','SELECT length(zapp.fn_list_shared_links(NULL,NULL,NULL,10)::text)')
  ) v(fname, expr)
  LOOP
    BEGIN
      EXECUTE r.expr INTO v_n; v_err := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_n := NULL; v_err := SQLERRM;
    END;
    v_out := v_out || r.fname || ' => ' ||
      CASE WHEN v_err IS NULL THEN 'ok=' || v_n::text ELSE 'ERRO[' || left(v_err,80) || ']' END || chr(10);
  END LOOP;
  RESET ROLE;
  RAISE EXCEPTION 'MEASURE1 %', v_out;
END $do$;
