\pset pager off
select rolname, rolsuper from pg_roles where rolname in ('postgres','supabase_admin');
select pg_has_role('postgres','supabase_admin','MEMBER') as pg_membro_supabase_admin;
select tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='cron' and not t.tgisinternal;
select extversion from pg_extension where extname='pg_cron';
do $$ begin
  begin
    set local role supabase_admin;
    raise notice 'set role supabase_admin: OK (current_user=%)', current_user;
    reset role;
  exception when others then
    raise notice 'set role supabase_admin: FALHOU %', sqlstate;
  end;
end $$;
