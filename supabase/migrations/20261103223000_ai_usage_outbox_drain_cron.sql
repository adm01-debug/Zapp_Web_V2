-- 20261103223000_ai_usage_outbox_drain_cron
-- IA-TIMEOUT-001: nada em produção chamava reprocessarLogEssencial, então
-- public.ai_usage_outbox só crescia. Este job drena a fila.
--
-- Segredo DEDICADO (padrão Multiplix), não o CRON_SECRET de três cópias:
-- o pg_cron lê o Vault a cada tick e a edge lê a mesma linha via RPC
-- service_role. Rotacionar é um único vault.update_secret.
--
-- Fora de public.admin_cron_jobs_permitidos de propósito: é consumidor de
-- durabilidade, não um job que o painel admin deve poder desligar.
--
-- Cadência 10 min no minuto :03 (3-53/10), lote 50, timeout 60s.
-- Não é a cada minuto: a fila é recuperação, não SLA de envio, e um tick
-- de 1 min concorreria com talkx/dispatch/ai-jobs no minuto cheio.
-- O intervalo (10 min) é maior que o timeout (60s), então dois drains não
-- se sobrepõem. A idempotência do log_key continua sendo a rede de segurança.
--
-- Janela esperada no merge: se esta migration aplicar antes do deploy da
-- edge, o tick leva 401/404 até o deploy publicar verify_jwt=false e o
-- handler novo. A fila não é apagada nesse intervalo. Não agendar antes
-- do código desta PR estar na main.

-- rollback: SELECT cron.unschedule(jobid) FROM cron.job
--   WHERE jobname = 'ai-usage-outbox-drain';
--   O segredo pode ficar no Vault (não vaza pelo comando do job).

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
