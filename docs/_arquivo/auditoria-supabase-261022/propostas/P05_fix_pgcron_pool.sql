-- P05: Reduzir falhas de pool exhaustion no pg_cron
-- Severidade: ALTA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- Causa: ~8 jobs pg_cron concorrentes a cada minuto esgotam o pool de conexões.
-- Jobs afetados: talkx-scheduler-1min (6.4% falha), dispatch-scheduled-messages (7.8%),
--   tasks-notify-due (4.9%), entre outros.

-- ============================================================
-- DIAGNÓSTICO (somente leitura):
-- ============================================================

-- Ver configuração atual do pg_cron:
SELECT name, setting FROM pg_settings WHERE name LIKE 'cron%';

-- Ver jobs simultâneos por minuto:
SELECT
  date_trunc('minute', start_time) as minuto,
  count(*) as jobs_simultâneos
FROM cron.job_run_details
WHERE start_time >= NOW() - INTERVAL '1 hour'
GROUP BY 1
ORDER BY jobs_simultâneos DESC
LIMIT 5;

-- ============================================================
-- PROPOSTA 1: Escalonar jobs que rodam a cada minuto
-- ============================================================

/*
-- Usar OFFSET nos schedules para distribuir a carga:
-- talkx-scheduler-1min:        * * * * *   (0s)
-- tasks-notify-due:             * * * * *  (mas com offset de 20s)
-- dispatch-scheduled-messages:  * * * * *  (mas com offset de 40s)
--
-- pg_cron não suporta segundos nativamente.
-- Alternativa: converter alguns para "a cada 2 minutos" se latência permite:

UPDATE cron.job SET schedule = '*/2 * * * *' WHERE jobname = 'tasks-notify-due';
-- ATENÇÃO: impacto no produto — tarefas atrasadas em até 2 min
*/

-- ============================================================
-- PROPOSTA 2: Aumentar max_connections do pg_cron
-- ============================================================

/*
-- Verificar limite atual:
SELECT setting FROM pg_settings WHERE name = 'cron.max_running_jobs';
-- Supabase gerencia isso; não editável via SQL arbitrário.
-- Solicitar via painel: Project Settings > Database > pg_cron.max_running_jobs
*/

-- ============================================================
-- ROLLBACK:
-- ============================================================

/*
-- Reverter schedule alterado:
UPDATE cron.job SET schedule = '* * * * *' WHERE jobname = 'tasks-notify-due';
*/