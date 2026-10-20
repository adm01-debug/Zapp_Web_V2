\pset pager off
select pg_get_userbyid(proowner) as dono from pg_proc where proname='apply_zapp_cron_secrets_l5';
select pg_get_userbyid(proowner) as dono from pg_proc where proname='trigger_talkx_engine_tick';
