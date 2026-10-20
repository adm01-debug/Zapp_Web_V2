\pset pager off
select jobname, schedule, command from cron.job where jobname in ('searchbox-budget-alert');
