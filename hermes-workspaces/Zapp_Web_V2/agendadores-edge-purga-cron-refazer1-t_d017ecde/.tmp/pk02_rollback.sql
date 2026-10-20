select cron.unschedule(jobid) from cron.job where username = current_user and jobname = 'auto-close-conversations';
drop function if exists public.apply_zapp_agendar_auto_close();
