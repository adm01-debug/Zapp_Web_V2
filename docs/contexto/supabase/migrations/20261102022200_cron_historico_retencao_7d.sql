do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cron-historico-retencao-7d',
      '17 3 * * *',
      $cmd$delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'$cmd$
    );
  end if;
end $$
