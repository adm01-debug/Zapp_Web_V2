-- 20261102022200_cron_historico_retencao_7d
-- Retencao de 7 dias para cron.job_run_details (historico do pg_cron).
--
-- Por que: o pg_cron grava uma linha por execucao e nunca apaga. Em 2026-11-02 eram
-- 305.010 linhas (85 MB, desde 2026-08-27) num banco Micro, e o talkx_engine_cron_runs
-- varre essa tabela a cada tick. A limpeza unica (238.173 linhas com mais de 7 dias)
-- foi feita pelo dono em 2026-11-02; este job impede que o historico volte a crescer.
-- O inventario (scripts/inventario/gerar-banco.mjs) acusa historico_cron_sem_limpeza
-- quando ha mais de 50 mil linhas com mais de 7 dias.
--
-- O DELETE roda como o dono do job (postgres), que tem DELETE em cron.job_run_details.
-- cron.schedule com o mesmo jobname altera o job existente do mesmo usuario (idempotente).
-- Rollback: select cron.unschedule('cron-historico-retencao-7d');
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cron-historico-retencao-7d',
      '17 3 * * *',
      $cmd$delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'$cmd$
    );
  end if;
end $$;
