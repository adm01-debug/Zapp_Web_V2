DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ai_usage_outbox_drain_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ai_usage_outbox_drain_cron_secret'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_usage_outbox_drain_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ai_usage_outbox_drain_cron_secret'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_ai_usage_outbox_drain_cron_secret() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_ai_usage_outbox_drain_cron_secret() TO service_role;

DO $$
BEGIN
  IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ai_usage_outbox_drain_cron_secret') IS NULL THEN
    RAISE EXCEPTION 'ai_usage_outbox_drain: segredo dedicado ausente no Vault';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'ai-usage-outbox-drain';

  PERFORM cron.schedule(
    'ai-usage-outbox-drain',
    '3-53/10 * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/ai-usage-outbox-drain',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ai_usage_outbox_drain_cron_secret')
      ),
      body := '{"limite":50}'::jsonb,
      timeout_milliseconds := 60000
    )
    $cmd$
  );
END;
$$;
