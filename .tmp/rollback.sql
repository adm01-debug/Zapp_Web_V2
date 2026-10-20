select cron.unschedule(jobid) from cron.job where username = current_user and jobname in ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs','purge-crm-sync-outbox','purge-ai-rate-limits','purge-cron-job-run-details');
drop function if exists public.apply_zapp_agendadores_e_purga_cron();
drop index if exists public.scheduled_reports_due_idx;
drop function if exists public.purge_cron_job_run_details(integer, integer);
drop function if exists public.zapp_purge_ai_rate_limits(integer);
drop function if exists public.zapp_purge_crm_sync_outbox(integer, integer, integer);
drop function if exists public.claim_due_scheduled_reports(integer);
drop function if exists public.next_report_send_at(text, timestamp with time zone);
drop function if exists public.zapp_project_url();
