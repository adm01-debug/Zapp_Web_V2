-- 20260927290000_multiplix_cron_scheduler
-- Scheduler pg_cron para disparar multiplix-send a cada 2 minutos.
-- Padrao identico ao gmail-cron-sync: vault secret + x-cron-secret header.
-- pg_cron 1.6.4 e pg_net 0.20.4 ja instalados em producao.

-- 1. Vault secret (idempotente via vault.create_secret, nao INSERT direto)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'multiplix_cron_secret') THEN
    PERFORM vault.create_secret(
      md5(random()::text) || md5(random()::text),
      'multiplix_cron_secret'
    );
  END IF;
END;
$$;

-- 2. RPC para a edge function ler o secret (SECURITY DEFINER, somente service_role)
CREATE OR REPLACE FUNCTION public.get_multiplix_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'multiplix_cron_secret'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_multiplix_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_multiplix_cron_secret() TO service_role;

-- 3. Funcao que itera dispatches em sending e dispara a edge function
--    LIMIT 10 por tick: evita fan-out explosivo em lotes grandes.
--    pg_net e fire-and-forget: a funcao nao aguarda resposta HTTP.
CREATE OR REPLACE FUNCTION public.trigger_pending_multiplix_dispatches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch_id uuid;
  v_anon_key text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets WHERE name = 'zapp_anon_key' LIMIT 1;

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'multiplix_cron_secret' LIMIT 1;

  FOR v_dispatch_id IN
    SELECT id FROM public.multiplix_dispatches
    WHERE status = 'sending'
    ORDER BY updated_at
    LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/multiplix-send',
      body := jsonb_build_object('dispatchId', v_dispatch_id::text, 'action', 'start'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_pending_multiplix_dispatches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_pending_multiplix_dispatches() TO service_role;

-- 4. Agendar cron a cada 2 minutos (idempotente)
SELECT cron.schedule(
  'multiplix-send-trigger',
  '*/2 * * * *',
  'SELECT public.trigger_pending_multiplix_dispatches()'
);
