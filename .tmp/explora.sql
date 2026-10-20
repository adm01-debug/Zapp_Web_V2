\pset pager off
select pg_get_functiondef('public.is_admin(uuid)'::regprocedure) as is_admin;
select pg_get_functiondef('auth.uid()'::regprocedure) as authuid;
select jobid, jobname, active, username from cron.job order by jobid;
select count(*) as audit_cols from information_schema.columns where table_schema='public' and table_name='audit_logs';
