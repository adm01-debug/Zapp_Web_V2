-- CRITICAL FIX: avatars-refresh cron uses sicoob_service_role_key (Sicoob PIX API key)
-- as the Supabase Bearer token. Supabase gateway rejects it → job has been silently
-- failing every hour since deployment.
-- Fix: switch to zapp_anon_key (valid Supabase API key; function uses internal
-- SUPABASE_SERVICE_ROLE_KEY env for data access, so anon key suffices for gateway auth).

DO $$ BEGIN
  PERFORM cron.unschedule('avatars-refresh');
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

SELECT cron.schedule(
  'avatars-refresh',
  '0 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$
);
