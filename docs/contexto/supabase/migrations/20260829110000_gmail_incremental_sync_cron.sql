SELECT cron.schedule(
  'gmail-incremental-sync',
  '*/5 * * * *',
  'SELECT net.http_post(url:=''https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/gmail-cron-sync'',body:=''{}''::jsonb,headers:=jsonb_build_object(''Content-Type'',''application/json'',''apikey'',''[REDACTED_JWT]'',''x-cron-secret'',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''gmail_cron_secret'')),timeout_milliseconds:=30000)')
