do $$
begin
  -- Reagendamento idempotente: se o job existir com o nome atual ele sai, e o schedule abaixo
  -- fixa a agenda nova. Reaplicar esta migration nao duplica job.
  if exists (select 1 from cron.job where jobname = 'ai-jobs-tick-1min') then
    perform cron.unschedule('ai-jobs-tick-1min');
  end if;

  -- O nome segue dizendo '1min': renomear mudaria o identificador operacional sem ganho,
  -- e a cadencia continua de 1 minuto.
  perform cron.schedule(
    'ai-jobs-tick-1min',
    '1-59 * * * *',
    'select public.trigger_ai_jobs_tick()'
  );
end
$$
