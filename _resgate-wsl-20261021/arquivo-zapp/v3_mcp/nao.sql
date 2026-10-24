DO $do$
DECLARE r record; v_def text; v_out text:=''; v_n int:=0; v_acl text;
BEGIN
  SELECT proacl::text INTO v_acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='zapp' AND p.proname='search_contacts' LIMIT 1;
  v_out := 'ACL_search_contacts=' || coalesce(v_acl,'null') || ' || ';
  FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args, pg_get_function_result(p.oid) ret
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef
     AND EXISTS(SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%')
     AND p.proname NOT IN ('search_contacts','search_contacts_advanced','fn_cookie_health','rpc_list_contacts',
       'rpc_list_messages_all','rpc_list_messages_lite','rpc_list_messages','rpc_global_search','rpc_unified_search',
       'rpc_resolve_instance_by_phone','rpc_resolve_whatsapp_instance','rpc_find_contact_by_phone',
       'get_companies_by_phones_batch','get_team_profiles','fn_get_deleted_messages','get_contact_notes',
       'fn_get_contact_summary','rpc_get_gmail_health_summary','fn_edge_get_evolution_credentials',
       'get_reset_requests_safe','export_user_data','get_profile_role_for_check','rpc_instance_stats',
       'get_duplicate_report','get_segment_contacts','rpc_search_messages','admin_listar_usuarios_painel',
       'rpc_contact_stats','fn_export_messages','get_avatars_by_jids_batch','rpc_dr_health_check','fn_contact_ranking',
       'rpc_get_notifications','fn_search_contacts','rpc_get_contact','rpc_get_message_details','fn_dashboard_data',
       'fn_attendance_report','get_contact_stats','get_platform_health','rpc_pipeline_dashboard','rpc_search_insights',
       'rpc_contract_inventory','fn_get_evolution_health_summary','rpc_zapp_dashboard','contacts_count_by_type',
       'fn_agent_metrics','get_lgpd_compliance_stats','fn_system_health_score','fn_health_preflight',
       'rpc_get_metrics_dashboard','find_duplicate_contacts','fn_list_shared_links','fn_audit_storage_orphans',
       'rpc_inbox_preview_batch','rpc_list_contact_links','fn_normalize_br_phone','fn_require_app_user',
       'is_admin_painel','is_admin_or_supervisor','current_user_is_privileged','can_supervise_profile',
       'fn_apply_connection_update','set_audio_transcription','rpc_get_contact_summary_batch','get_contact_conversations',
       'fn_get_message_reactions','fn_circuit_status','fn_wal_slot_lag_check','rpc_instance_auth_event_summary',
       'rpc_get_pipeline_health_v2','fn_zapp_web_smoke_test_v2','fn_message_rate_5min','fn_connection_drift_summary',
       'rpc_queue_goal_metrics','fn_call_stats','fn_baileys_logout_metrics','rpc_refresh_metrics')
   ORDER BY 2,3
  LOOP
    v_def := pg_get_functiondef(r.oid);
    CONTINUE WHEN NOT (r.ret LIKE 'TABLE(%' OR r.ret LIKE 'SETOF %' OR r.ret LIKE 'json%');
    CONTINUE WHEN v_def !~* '\y(evolution_contacts|evolution_messages|evolution_instance_credentials|cookies_config|cookie_probe_log|evolution_notifications|contact_purchases|password_reset_requests|login_attempts|gmail_accounts|whatsapp_connections|contacts|profiles|contatos|empresas|decrypted_secrets|evolution_conversations_financeiro)\y';
    CONTINUE WHEN v_def ~* '(is_admin|is_supervisor|current_user_is_privileged|is_manager_or_above|fn_require_app_user)\y';
    v_n := v_n+1;
    IF length(v_out) < 5500 THEN
      v_out := v_out || r.ns||'.'||r.fn||'('||r.args||')'||chr(10);
    END IF;
  END LOOP;
  RAISE EXCEPTION 'NAO_AUDITADAS_SENSIVEIS_SEM_GUARDA=% %', v_n, v_out;
END $do$;
