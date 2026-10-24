DO $$
DECLARE
  _rep text := '';
  _t text;
  _n int;
  r record;
  _faltantes constant text[] := ARRAY[
    'email_app.email_messages','email_app.email_tracking_events','email_app.imap_smtp_accounts',
    'evo.evolution_alerts','evo.evolution_label_associations','evo.evolution_labels',
    'evo.evolution_reactions','evo.evolution_realtime_events','evo.evolution_retry_metrics',
    'evo.evolution_sentiment_analysis','evo.evolution_status_reactions','evo.evolution_whatsapp_status',
    'zapp.contact_audit_log','zapp.feature_flags','zapp.notifications',
    'zapp.outbound_message_queue','zapp.queue_goals'];
BEGIN
  -- as 17 tabelas do manifesto ausentes da publicacao EXISTEM no banco?
  FOREACH _t IN ARRAY _faltantes LOOP
    SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname = split_part(_t,'.',1) AND c.relname = split_part(_t,'.',2)
       AND c.relkind IN ('r','p');
    _rep := _rep || 'G.existe.' || _t || '=' || _n || chr(10);
  END LOOP;

  -- as 4 extras existem?
  FOREACH _t IN ARRAY ARRAY['zapp.evolution_alerts','zapp.evolution_realtime_events','zapp.realtime_message_fanout','zapp.security_acl_alerts'] LOOP
    SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname = split_part(_t,'.',1) AND c.relname = split_part(_t,'.',2)
       AND c.relkind IN ('r','p');
    _rep := _rep || 'G.extra_existe.' || _t || '=' || _n || chr(10);
  END LOOP;

  -- pubinsert/pubupdate/pubdelete da publicacao
  FOR r IN SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate, pubviaroot
             FROM pg_publication WHERE pubname='supabase_realtime'
  LOOP
    _rep := _rep || 'G.pub ' || r.pubname || ' alltables=' || r.puballtables::text
         || ' ins=' || r.pubinsert::text || ' upd=' || r.pubupdate::text
         || ' del=' || r.pubdelete::text || ' trunc=' || r.pubtruncate::text
         || ' viaroot=' || r.pubviaroot::text || chr(10);
  END LOOP;

  _rep := _rep || chr(10);

  -- ================= ledger de migrations aplicadas =================
  FOR r IN
    SELECT version, name
      FROM supabase_migrations.schema_migrations
     WHERE version IN ('20260928170000','20260928172940','20260928180000','20260928190000',
                       '20260928210000','20260928220000','20260928230000')
     ORDER BY version
  LOOP
    _rep := _rep || 'LR.ledger ' || r.version || ' = ' || coalesce(r.name,'(sem nome)') || chr(10);
  END LOOP;

  SELECT count(*) INTO _n FROM supabase_migrations.schema_migrations WHERE version LIKE '20260928%';
  _rep := _rep || 'LR.total_migrations_20260928=' || _n || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
