DO $do$
DECLARE
  r record; v_n bigint; v_err text; v_out text := '';
  v_sub uuid; v_claims text; v_subnull boolean;
BEGIN
  SELECT p.user_id INTO v_sub FROM zapp.profiles p
    JOIN zapp.user_roles ur ON ur.user_id = p.user_id
   WHERE ur.role::text IN ('agent','atendente','user','vendedor') LIMIT 1;
  IF v_sub IS NULL THEN
    SELECT user_id INTO v_sub FROM zapp.user_roles WHERE role::text NOT IN ('dev','admin','manager','supervisor','owner') LIMIT 1;
  END IF;
  v_subnull := (v_sub IS NULL);
  v_claims := json_build_object('sub', v_sub, 'role','authenticated')::text;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', v_claims, true);
  FOR r IN SELECT * FROM (VALUES
    ('META:sub_null','SELECT CASE WHEN __SUBNULL__ THEN 1 ELSE 0 END'),
    ('D2:evolution_contacts','SELECT count(*) FROM zapp.evolution_contacts'),
    ('D2:evolution_messages','SELECT count(*) FROM zapp.evolution_messages'),
    ('D2:contact_notes','SELECT count(*) FROM zapp.contact_notes'),
    ('D2:contact_purchases','SELECT count(*) FROM zapp.contact_purchases'),
    ('D2:evolution_instance_credentials','SELECT count(*) FROM zapp.evolution_instance_credentials'),
    ('D2:cookies_config','SELECT count(*) FROM zapp.cookies_config'),
    ('L2:rpc_list_contacts','SELECT count(*) FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,100000,0)'),
    ('L2:rpc_list_messages_all','SELECT count(*) FROM zapp.rpc_list_messages_all(NULL,NULL,NULL,NULL,NULL,NULL,100000,0)'),
    ('L2:rpc_list_messages_lite','SELECT count(*) FROM zapp.rpc_list_messages_lite((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL,100000,0,NULL)'),
    ('L2:rpc_get_contact(jid)','SELECT count(*) FROM zapp.rpc_get_contact((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL)'),
    ('L2:rpc_get_message_details','SELECT count(*) FROM zapp.rpc_get_message_details((SELECT id FROM zapp.rpc_list_messages_all(NULL,NULL,NULL,NULL,NULL,NULL,1,0)))'),
    ('L2:public.rpc_get_contact','SELECT count(*) FROM public.rpc_get_contact((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL)'),
    ('L2:rpc_search_messages','SELECT count(*) FROM zapp.rpc_search_messages(''a'',NULL,100)'),
    ('L2:rpc_global_search','SELECT length(zapp.rpc_global_search(''a'',100,NULL)::text)'),
    ('L2:rpc_unified_search','SELECT count(*) FROM zapp.rpc_unified_search(''a'',100)'),
    ('L2:rpc_inbox_preview_batch','SELECT length(zapp.rpc_inbox_preview_batch(ARRAY[(SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0))],NULL,10)::text)'),
    ('L2:search_contacts_advanced','SELECT count(*) FROM zapp.search_contacts_advanced(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,100000)'),
    ('L2:rpc_list_contact_links','SELECT count(*) FROM zapp.rpc_list_contact_links((SELECT id FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),100)'),
    ('L2:find_duplicate_contacts','SELECT count(*) FROM zapp.find_duplicate_contacts(NULL,100000)'),
    ('L2:rpc_find_contact_by_phone','SELECT count(*) FROM zapp.rpc_find_contact_by_phone((SELECT phone_number FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)))'),
    ('L2:get_companies_by_phones_batch','SELECT count(*) FROM zapp.get_companies_by_phones_batch(ARRAY[(SELECT phone_number FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0))])'),
    ('L2:rpc_resolve_instance_by_phone','SELECT count(*) FROM zapp.rpc_resolve_instance_by_phone((SELECT phone_number FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)))'),
    ('L2:rpc_resolve_whatsapp_instance','SELECT count(*) FROM zapp.rpc_resolve_whatsapp_instance((SELECT id FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)))'),
    ('L2:get_avatars_by_jids_batch','SELECT count(*) FROM zapp.get_avatars_by_jids_batch(ARRAY[(SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0))])'),
    ('L2:get_team_profiles','SELECT count(*) FROM zapp.get_team_profiles()'),
    ('L2:get_contact_notes','SELECT count(*) FROM zapp.get_contact_notes((SELECT id FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),100)'),
    ('L2:fn_get_contact_summary','SELECT length(zapp.fn_get_contact_summary((SELECT id FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)))::text)'),
    ('L2:fn_export_messages','SELECT count(*) FROM zapp.fn_export_messages((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL,NULL,NULL)'),
    ('L2:fn_get_conversation_history','SELECT count(*) FROM zapp.fn_get_conversation_history((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL,100000)'),
    ('L2:fn_get_deleted_messages','SELECT length(zapp.fn_get_deleted_messages((SELECT instance_name FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),(SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),100)::text)'),
    ('L2:fn_get_pending_messages','SELECT count(*) FROM zapp.fn_get_pending_messages((SELECT instance_name FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)))'),
    ('A2:get_reset_requests_safe','SELECT count(*) FROM zapp.get_reset_requests_safe()'),
    ('A2:contacts_count_by_type','SELECT count(*) FROM zapp.contacts_count_by_type()'),
    ('A2:rpc_contact_stats','SELECT length(zapp.rpc_contact_stats()::text)'),
    ('A2:get_duplicate_report','SELECT length(zapp.get_duplicate_report(NULL)::text)'),
    ('A2:rpc_get_metrics_dashboard','SELECT length(zapp.rpc_get_metrics_dashboard()::text)'),
    ('A2:rpc_zapp_dashboard','SELECT count(*) FROM zapp.rpc_zapp_dashboard()'),
    ('A2:rpc_instance_stats','SELECT count(*) FROM zapp.rpc_instance_stats(NULL)'),
    ('A2:get_profile_role_for_check','SELECT count(*) FROM zapp.get_profile_role_for_check(NULL)'),
    ('A2:export_user_data','SELECT length(zapp.export_user_data(NULL)::text)'),
    ('G1:fn_edge_get_evolution_credentials','SELECT count(*) FROM zapp.fn_edge_get_evolution_credentials(''wpp2'')'),
    ('G2:rpc_dr_health_check','SELECT length(zapp.rpc_dr_health_check()::text)'),
    ('G3:fn_contact_ranking','SELECT count(*) FROM zapp.fn_contact_ranking(50)'),
    ('G4:fn_cookie_health','SELECT count(*) FROM zapp.fn_cookie_health()'),
    ('G5:admin_listar_usuarios_painel','SELECT count(*) FROM zapp.admin_listar_usuarios_painel(true)'),
    ('G6:fn_require_app_user','SELECT 1 FROM zapp.fn_require_app_user()')
  ) v(fname, expr)
  LOOP
    BEGIN
      EXECUTE replace(r.expr, '__SUBNULL__', CASE WHEN v_subnull THEN 'true' ELSE 'false' END) INTO v_n; v_err := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_n := NULL; v_err := SQLERRM;
    END;
    v_out := v_out || r.fname || ' => ' ||
      CASE WHEN v_err IS NULL THEN 'ok=' || v_n::text ELSE 'ERRO[' || left(v_err,70) || ']' END || chr(10);
  END LOOP;
  RESET ROLE;
  RAISE EXCEPTION 'MEASURE2 %', v_out;
END $do$;
