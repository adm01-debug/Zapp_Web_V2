DO $do$
DECLARE r record; v_n bigint; v_err text; v_out text := ''; v_sub uuid; v_claims text;
        v_secret text; v_has boolean;
BEGIN
  SELECT secret INTO v_secret FROM vault.secrets LIMIT 1;
  SELECT p.user_id INTO v_sub FROM zapp.profiles p JOIN zapp.user_roles ur ON ur.user_id=p.user_id
   WHERE ur.role::text IN ('agent','atendente','user','vendedor') LIMIT 1;
  v_claims := json_build_object('sub', v_sub, 'role','authenticated')::text;

  v_has := (position(v_secret IN zapp.fn_system_health_score()::text) > 0);
  v_out := v_out || 'OWN:system_health_score_contem_secret=' || CASE WHEN v_has THEN 'SIM' ELSE 'nao' END || chr(10);
  v_has := (position(v_secret IN zapp.fn_attendance_report('2000-01-01','2030-12-31')::text) > 0);
  v_out := v_out || 'OWN:attendance_report_contem_secret=' || CASE WHEN v_has THEN 'SIM' ELSE 'nao' END || chr(10);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  FOR r IN SELECT * FROM (VALUES
    ('NOAUTH:get_segment_contacts','SELECT count(*) FROM zapp.get_segment_contacts(NULL,50,0)'),
    ('NOAUTH:fn_export_messages','SELECT count(*) FROM zapp.fn_export_messages((SELECT remote_jid FROM zapp.fn_export_messages(NULL,NULL,NULL,NULL) LIMIT 1),NULL,NULL,NULL)'),
    ('NOAUTH:get_contact_conversations','SELECT count(*) FROM zapp.get_contact_conversations(NULL,10)'),
    ('NOAUTH:fn_get_message_reactions','SELECT length(zapp.fn_get_message_reactions(NULL,NULL)::text)'),
    ('NOAUTH:system_health_secret','SELECT CASE WHEN position(''__SEC__'' IN zapp.fn_system_health_score()::text)>0 THEN 1 ELSE 0 END'),
    ('NOAUTH:rpc_search_insights','SELECT length(zapp.rpc_search_insights(7)::text)')
  ) v(fname, expr)
  LOOP
    BEGIN EXECUTE replace(r.expr,'__SEC__','') INTO v_n; v_err:=NULL;
    EXCEPTION WHEN OTHERS THEN v_n:=NULL; v_err:=SQLERRM; END;
    v_out := v_out || r.fname || ' => ' || CASE WHEN v_err IS NULL THEN 'ok='||v_n::text ELSE 'ERRO['||left(v_err,60)||']' END || chr(10);
  END LOOP;

  PERFORM set_config('request.jwt.claims', v_claims, true);
  FOR r IN SELECT * FROM (VALUES
    ('AGENT:fn_export_messages','SELECT count(*) FROM zapp.fn_export_messages((SELECT remote_jid FROM zapp.evolution_contacts LIMIT 1),(SELECT instance_name FROM zapp.evolution_contacts LIMIT 1),NULL,NULL)'),
    ('AGENT:rpc_list_messages','SELECT count(*) FROM zapp.rpc_list_messages((SELECT remote_jid FROM zapp.rpc_list_contacts(NULL,NULL,NULL,NULL,1,0)),NULL,100000,NULL)'),
    ('AGENT:fn_get_contact_summary','SELECT length(zapp.fn_get_contact_summary((SELECT id FROM zapp.evolution_contacts LIMIT 1))::text)'),
    ('AGENT:get_contact_conversations','SELECT count(*) FROM zapp.get_contact_conversations((SELECT id FROM zapp.evolution_contacts LIMIT 1),10)'),
    ('AGENT:search_contacts','SELECT count(*) FROM zapp.search_contacts()'),
    ('AGENT:get_avatars_by_jids_batch','SELECT count(*) FROM zapp.get_avatars_by_jids_batch(ARRAY[(SELECT remote_jid FROM zapp.evolution_contacts LIMIT 1)])'),
    ('AGENT:fn_get_deleted_messages','SELECT length(zapp.fn_get_deleted_messages((SELECT instance_name FROM zapp.evolution_contacts LIMIT 1),(SELECT remote_jid FROM zapp.evolution_contacts LIMIT 1),100)::text)'),
    ('AGENT:rpc_get_contact(text)','SELECT count(*) FROM zapp.rpc_get_contact((SELECT remote_jid FROM zapp.evolution_contacts LIMIT 1),NULL)'),
    ('AGENT:rpc_list_messages_lite','SELECT count(*) FROM zapp.rpc_list_messages_lite((SELECT remote_jid FROM zapp.evolution_contacts LIMIT 1),(SELECT instance_name FROM zapp.evolution_contacts LIMIT 1),100000,0,NULL)')
  ) v(fname, expr)
  LOOP
    BEGIN EXECUTE r.expr INTO v_n; v_err:=NULL;
    EXCEPTION WHEN OTHERS THEN v_n:=NULL; v_err:=SQLERRM; END;
    v_out := v_out || r.fname || ' => ' || CASE WHEN v_err IS NULL THEN 'ok='||v_n::text ELSE 'ERRO['||left(v_err,60)||']' END || chr(10);
  END LOOP;
  RESET ROLE;
  RAISE EXCEPTION 'MEASURE4 %', v_out;
END $do$;
