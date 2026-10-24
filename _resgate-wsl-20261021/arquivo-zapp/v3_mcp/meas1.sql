DO $$
DECLARE
  rep text := ''; n bigint; j jsonb; t text;
  v_jid text; v_inst text := 'wpp2';
  v_cid uuid; v_sid uuid; v_mid text; v_uid uuid; v_conn uuid;
BEGIN
  rep := rep || format('schema_usage_zapp=%s schema_usage_public=%s', has_schema_privilege('authenticated','zapp','USAGE'), has_schema_privilege('authenticated','public','USAGE')) || E'\n';

  SELECT remote_jid INTO v_jid FROM zapp.evolution_messages WHERE instance_name = v_inst GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  SELECT contact_id INTO v_cid FROM zapp.evolution_conversations WHERE contact_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  SELECT id INTO v_sid FROM zapp.contact_segments LIMIT 1;
  SELECT message_id INTO v_mid FROM zapp.evolution_reactions WHERE message_id IS NOT NULL LIMIT 1;
  SELECT user_id INTO v_uid FROM zapp.profiles WHERE user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_conn FROM zapp.whatsapp_connections LIMIT 1;
  rep := rep || format('anchors jid=%s cid=%s sid=%s mid=%s uid=%s conn=%s',
        v_jid IS NOT NULL, v_cid IS NOT NULL, v_sid IS NOT NULL, v_mid IS NOT NULL, v_uid IS NOT NULL, v_conn IS NOT NULL) || E'\n';

  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_export_messages($1,$2,NULL,NULL)' INTO n USING v_jid, v_inst;
    rep := rep || format('fn_export_messages=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_export_messages=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_conversation_history($1,$2,100)' INTO n USING v_jid, v_inst;
    rep := rep || format('fn_get_conversation_history=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_conversation_history=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_pending_messages($1)' INTO n USING v_inst;
    rep := rep || format('fn_get_pending_messages=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_pending_messages=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_get_deleted_messages($1,NULL,50)' INTO j USING v_inst;
    rep := rep || format('fn_get_deleted_messages_total=%s', j->>'total') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_deleted_messages=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_contact_conversations($1,30)' INTO n USING v_cid;
    rep := rep || format('get_contact_conversations=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_contact_conversations=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_contact_notes($1,30)' INTO n USING v_cid;
    rep := rep || format('get_contact_notes=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_contact_notes=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_segment_contacts($1,50,0)' INTO n USING v_sid;
    rep := rep || format('get_segment_contacts=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_segment_contacts=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_reset_requests_safe()' INTO n;
    rep := rep || format('get_reset_requests_safe=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_reset_requests_safe=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_list_shared_links($1,NULL,NULL,50)' INTO j USING v_inst;
    rep := rep || format('fn_list_shared_links_total=%s', j->>'total') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_list_shared_links=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_list_message_reactions($1,$2)' INTO j USING v_mid, v_inst;
    rep := rep || format('fn_list_message_reactions_total=%s', j->>'total') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_list_message_reactions=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.rpc_get_reactions_batch(ARRAY[$1])' INTO j USING v_mid;
    rep := rep || format('rpc_get_reactions_batch_keys=%s', coalesce(j, 'null'::jsonb)::text LIKE '{%') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_get_reactions_batch=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.contacts_count_by_type()' INTO n;
    rep := rep || format('contacts_count_by_type=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'contacts_count_by_type=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.is_account_locked(''fulano@exemplo.invalid'')' INTO n;
    rep := rep || format('is_account_locked_linhas=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'is_account_locked=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_profile_role_for_check($1)' INTO n USING v_uid;
    rep := rep || format('get_profile_role_for_check=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_profile_role_for_check=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_audit_storage_orphans(''whatsapp-media'',365,5)' INTO n;
    rep := rep || format('fn_audit_storage_orphans=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_audit_storage_orphans=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_active_alerts(NULL)' INTO n;
    rep := rep || format('fn_get_active_alerts=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_active_alerts=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.get_connection_qr_code($1)' INTO t USING v_conn;
    rep := rep || format('get_connection_qr_code_len=%s', coalesce(length(t),0)) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_connection_qr_code=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_normalize_send_jid($1,$2)' INTO t USING v_jid, v_inst;
    rep := rep || format('fn_normalize_send_jid_len=%s', coalesce(length(t),0)) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_normalize_send_jid=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_own_lockout_status(''fulano@exemplo.invalid'')' INTO n;
    rep := rep || format('get_own_lockout_status_linhas=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_own_lockout_status=ERRO ' || SQLERRM || E'\n'; END;

  RESET ROLE;
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
