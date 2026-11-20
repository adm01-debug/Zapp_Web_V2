-- 20261120080000_scheduled_report_cron
-- DASH-083 (P0): a UI do dashboard grava os relatórios agendados em
-- `scheduled_report_configs`, mas a edge `send-scheduled-report` só lia a
-- tabela legada `scheduled_reports` e nenhum cron disparava o envio. O cron
-- abaixo fecha a cadeia: a cada 2 minutos busca configs ativas e vencidas e
-- chama a edge com o segredo dedicado do Vault (padrão 20260927320000 /
-- 20260930240000 — credencial de máquina nunca exposta a anon/authenticated).

-- 1. Vault secret dedicado (idempotente, gerado DENTRO do Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'scheduled_report_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'scheduled_report_cron_secret',
      'Credencial de maquina do cron de relatorios agendados (pg_cron -> send-scheduled-report). Gerada in-db 2026-11-20. NUNCA logar.'
    );
  END IF;
END $$;

-- 2. RPC para a edge ler o secret (SECURITY DEFINER, somente service_role)
CREATE OR REPLACE FUNCTION public.get_scheduled_report_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'scheduled_report_cron_secret'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_scheduled_report_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_report_cron_secret() TO service_role;

-- 3. Dispara a edge para cada config ativa e vencida (ou nunca agendada).
--    LIMIT 20 por tick: evita fan-out explosivo em lotes grandes.
--    Só frequências recorrentes entram no ciclo automático; `custom` é
--    sob demanda (botão "Enviar agora") e nunca é agendada pelo cron.
CREATE OR REPLACE FUNCTION public.trigger_due_scheduled_report_configs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'scheduled_report_cron_secret' LIMIT 1;

  FOR v_config_id IN
    SELECT id FROM public.scheduled_report_configs
    WHERE is_active
      AND frequency IN ('daily', 'weekly', 'biweekly', 'monthly')
      AND (next_send_at IS NULL OR next_send_at <= now())
    ORDER BY created_at
    LIMIT 20
  LOOP
    PERFORM net.http_post(
      url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/send-scheduled-report',
      body := jsonb_build_object('configId', v_config_id::text),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_due_scheduled_report_configs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_due_scheduled_report_configs() TO service_role;

-- 4. Agenda o tick a cada 2 minutos (idempotente: mesmo nome atualiza)
SELECT cron.schedule(
  'send-scheduled-report-trigger',
  '*/2 * * * *',
  'SELECT public.trigger_due_scheduled_report_configs()'
);
