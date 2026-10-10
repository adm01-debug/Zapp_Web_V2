-- Reagenda o tick da fila de IA para fora do minuto 0 (achado do TALK X sobre contencao do pg_cron).
--
-- Por que: no minuto 0 de cada hora coincidem 9 jobs agendados (tres `* * * * *`, dois `*/2`,
-- dois `*/5`, um `*/15` e o horario) num banco com max_worker_processes=6, e o agendador falha
-- por 'job startup timeout'. Medido em 02/10: `talkx-scheduler-1min` e `tasks-notify-due`
-- acumulam 234 falhas cada, com contagens identicas - falha de agendador, nao de job isolado.
--
-- O que muda: o tick mantem a cadencia de 1 minuto, mas deixa de disparar no minuto 0
-- (`1-59 * * * *` = a cada minuto, do minuto 1 ao 59). Custo medido por avaliacao das expressoes:
-- `* * * * *` = 60 disparos/hora, intervalo medio 1,00 min, maior intervalo 1 min;
-- `1-59 * * * *` = 59 disparos/hora, intervalo medio 1,02 min, maior intervalo 2 min;
-- `*/2 * * * *` = 30 disparos/hora, intervalo medio 2,00 min. Ou seja: a alternativa `*/2`
-- custaria o dobro de latencia e, por incluir o minuto 0, nao reduziria o pico.
-- A fila recebe ~0,18 job/min contra p_limit de 10 por tick, entao o custo pratico e no maximo
-- 1 job esperando <=1 min extra por hora - contra 46% de falha de agendador.
--
-- NAO resolver sozinho: tirar este job leva 9 -> 8 concorrentes no minuto 0, e o teto e 6.
-- Os outros dois `* * * * *` (talkx-scheduler-1min, tasks-notify-due) precisam sair do minuto 0
-- do mesmo jeito, e os grupos `*/2`/`*/5`/`*/15` podem ir para `1-59/2`, `2-59/5`, `3-59/15`.
-- Registrado no PR.
--
-- rollback: select cron.unschedule('ai-jobs-tick-1min'); select cron.schedule('ai-jobs-tick-1min', '* * * * *', 'select public.trigger_ai_jobs_tick()');

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
$$;
