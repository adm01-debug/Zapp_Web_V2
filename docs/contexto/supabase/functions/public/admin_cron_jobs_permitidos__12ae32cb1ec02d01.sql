CREATE OR REPLACE FUNCTION public.admin_cron_jobs_permitidos()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT ARRAY[
    'ai-jobs-tick-1min',
    'avatars-refresh',
    'connection-health-check',
    'expire-stale-agent-presence',
    'gmail-incremental-sync',
    'multiplix-send-trigger',
    'searchbox-budget-alert',
    'talkx-scheduler-1min',
    'tasks-notify-due'
  ]::text[];
$function$
