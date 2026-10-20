select 'gatilhos=' || count(*)::text from pg_trigger where not tgisinternal and tgname like 'trg_audit_admin_%';
select 'funcao=' || count(*)::text from pg_proc where proname = 'audit_admin_change';
select 'rlspublico_audit_logs=' || count(*)::text from pg_policies where tablename = 'audit_logs' and with_check = 'false';
