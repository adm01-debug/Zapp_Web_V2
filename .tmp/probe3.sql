\pset pager off
select p.oid::regprocedure::text as assinatura
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='cron' and p.proname='schedule';
-- teste empirico: schedule com mesmo nome + active=false (transacao revertida)
begin;
select cron.schedule('talkx-scheduler-1min', '* * * * *', 'SELECT public.trigger_talkx_engine_tick()', 'postgres', 'postgres', false) as retorno;
select active, jobid from cron.job where jobname='talkx-scheduler-1min';
rollback;
