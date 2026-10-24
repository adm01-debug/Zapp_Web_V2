DO $$
DECLARE
  rep text := ''; n bigint; it text; arr text[][] := ARRAY[
    ['tbl_evolution_messages','SELECT count(*) FROM zapp.evolution_messages'],
    ['tbl_evolution_messages_wpp2','SELECT count(*) FROM zapp.evolution_messages_wpp2'],
    ['tbl_evolution_conversations','SELECT count(*) FROM zapp.evolution_conversations'],
    ['tbl_evolution_contacts','SELECT count(*) FROM zapp.evolution_contacts'],
    ['tbl_contact_notes','SELECT count(*) FROM zapp.contact_notes'],
    ['tbl_contact_segments','SELECT count(*) FROM zapp.contact_segments'],
    ['tbl_login_attempts','SELECT count(*) FROM zapp.login_attempts'],
    ['tbl_password_reset_requests','SELECT count(*) FROM zapp.password_reset_requests'],
    ['tbl_evo_instance_credentials','SELECT count(*) FROM zapp.evolution_instance_credentials'],
    ['tbl_evolution_alerts','SELECT count(*) FROM zapp.evolution_alerts'],
    ['alerts_com_digitos_longe','SELECT count(*) FROM zapp.evolution_alerts WHERE (coalesce(title,'''')||'' ''||coalesce(description,'''')) ~ ''[0-9]{11,15}'''],
    ['tbl_evolution_reactions','SELECT count(*) FROM zapp.evolution_reactions'],
    ['tbl_msg_queue_pending','SELECT count(*) FROM zapp.evolution_message_queue WHERE status=''pending'''],
    ['tbl_outbound_queue_pending','SELECT count(*) FROM zapp.outbound_message_queue WHERE status=''pending'''],
    ['tbl_evolution_whatsapp_status','SELECT count(*) FROM zapp.evolution_whatsapp_status'],
    ['tbl_processed_requests','SELECT count(*) FROM zapp.processed_requests'],
    ['tbl_mv_instance_metrics','SELECT count(*) FROM zapp.mv_instance_metrics'],
    ['tbl_contact_intelligence','SELECT count(*) FROM zapp.contact_intelligence'],
    ['msgs_com_content','SELECT count(*) FROM zapp.evolution_messages WHERE content IS NOT NULL'],
    ['tbl_evolution_message_templates','SELECT count(*) FROM zapp.evolution_message_templates'],
    ['tbl_knowledge_base_articles','SELECT count(*) FROM zapp.knowledge_base_articles'],
    ['tbl_email_threads','SELECT count(*) FROM email_app.email_threads'],
    ['tbl_gmail_accounts','SELECT count(*) FROM zapp.gmail_accounts'],
    ['tbl_sicoob_outbox','SELECT count(*) FROM financeiro.sicoob_reply_outbox'],
    ['tbl_sicoob_outbox_pending','SELECT count(*) FROM financeiro.sicoob_reply_outbox WHERE status=''pending''']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(arr, 1) LOOP
    BEGIN
      EXECUTE arr[i][2] INTO n;
      rep := rep || format('%s=%s', arr[i][1], n) || E'\n';
    EXCEPTION WHEN OTHERS THEN
      rep := rep || format('%s=ERRO %s', arr[i][1], SQLERRM) || E'\n';
    END;
  END LOOP;

  BEGIN
    EXECUTE 'SELECT count(*) FROM storage.objects' INTO n;
    rep := rep || format('storage_objects=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'storage_objects=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SELECT string_agg(DISTINCT bucket_id, '','') FROM storage.objects' INTO it;
    rep := rep || format('storage_bucket_ids=%s', coalesce(it,'-')) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'storage_bucket_ids=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SELECT string_agg(x.f, '','') FROM (SELECT n.nspname||''.''||p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname = ANY(ARRAY[''search_contacts'',''rpc_list_contacts'',''rpc_list_messages_all'',''search_contacts_advanced'',''fn_get_contact_summary'',''get_companies_by_phones_batch'',''rpc_find_contact_by_phone'',''rpc_resolve_whatsapp_instance'',''rpc_resolve_instance_by_phone'',''get_team_profiles'',''rpc_global_search'',''rpc_unified_search''])) x' INTO it;
    rep := rep || format('fora_de_escopo_existentes=%s', coalesce(it,'NENHUMA')) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fora_de_escopo=ERRO ' || SQLERRM || E'\n'; END;

  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
