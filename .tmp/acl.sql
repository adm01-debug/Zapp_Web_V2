\pset pager off
select p.proname, pg_get_userbyid(p.proowner) as dono, p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='cron' and p.proname in ('alter_job','schedule','unschedule');
select relname, pg_get_userbyid(relowner) as dono, relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cron' and relname='job';
select pg_get_userbyid(proowner) as dono_funcao from pg_proc where proname='admin_toggle_cron_job';
select current_user, session_user;
