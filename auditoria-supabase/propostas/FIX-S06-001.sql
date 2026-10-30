-- FIX-S06-001: Saturacao do pool pg_cron — escalonar crons conflitantes
-- Problema: 24 crons ativos com max_running_jobs=32.
--           dispatch_scheduled_messages: 686 falhas (6.53%).
--           talkx-scheduler-1min: 4342 falhas (10.06%).
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

BEGIN;

-- Reduzir frequencia de crons de baixa criticidade para libertar slots
UPDATE cron.job
SET schedule = '*/3 * * * *'
WHERE jobname = 'expire-stale-agent-presence';

UPDATE cron.job
SET schedule = '*/3 * * * *'
WHERE jobname = 'csat-reply-capture-tick';

UPDATE cron.job
SET schedule = '*/5 * * * *'
WHERE jobname = 'crm-sync-outbox';

-- Verificacao pos-apply:
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'expire-stale-agent-presence',
  'csat-reply-capture-tick',
  'crm-sync-outbox'
)
ORDER BY jobname;

COMMIT;

-- ROLLBACK:
/*
BEGIN;
UPDATE cron.job SET schedule = '1-59/2 * * * *' WHERE jobname = 'expire-stale-agent-presence';
UPDATE cron.job SET schedule = '*/2 * * * *' WHERE jobname = 'csat-reply-capture-tick';
UPDATE cron.job SET schedule = '1-59/2 * * * *' WHERE jobname = 'crm-sync-outbox';
COMMIT;
*/

-- RISCO DE REGRESSAO: MEDIO
-- Monitorar taxa de falha nos 7 dias seguintes.
