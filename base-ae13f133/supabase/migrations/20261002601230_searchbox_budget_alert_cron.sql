-- migration: searchbox_budget_alert_cron (E91 - alerta de custo do modulo de busca)
-- Decisao do Joaquim (2026-10-02): canal = notificacao no app (padrao notify_due_tasks) + e-mail
-- para adm01@promobrindes.com.br. O e-mail sai pela edge searchbox-budget-alert (net.http_post,
-- padrao gmail_incremental_sync_cron). Roda 1x/dia, dispara na virada dos 400 usos no mes.
--
-- Idempotencia: a view de origem nao tem coluna para marcar (diferente de
-- conversation_tasks.notified_at), entao o proprio registro em notifications e o ledger: 1 alerta
-- por mes, checado por type + metadata->>'mes'.

-- rollback: SELECT cron.unschedule('searchbox-budget-alert'); DROP FUNCTION IF EXISTS public.notify_searchbox_budget();
-- rollback: (as notificacoes ja gravadas sao historico de alerta e podem ficar; para remove-las: DELETE FROM public.notifications WHERE type = 'searchbox_budget_alert')
CREATE OR REPLACE FUNCTION public.notify_searchbox_budget()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mes     text;
  v_sessoes integer;
  v_dest    record;
  v_count   integer := 0;
  v_limite  integer := 400;
BEGIN
  v_mes := to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM');

  SELECT coalesce(sum(sessoes), 0) INTO v_sessoes
  FROM public.searchbox_usage_daily
  WHERE dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

  IF v_sessoes < v_limite THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'searchbox_budget_alert'
      AND metadata->>'mes' = v_mes
  ) THEN
    RETURN 0;
  END IF;

  FOR v_dest IN
    SELECT user_id FROM public.profiles
    WHERE role IN ('admin', 'supervisor') AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (
      v_dest.user_id,
      'Custo do autocomplete de endereco: ' || v_sessoes || ' usos no mes',
      'O teto gratis da Mapbox e 500 sessoes/mes e o guarda passa a degradar em 450. '
        || 'Acompanhe em docs/mapa/USO_SEARCHBOX.md (view searchbox_usage_daily).',
      'searchbox_budget_alert',
      jsonb_build_object('mes', v_mes, 'sessoes', v_sessoes, 'limite', v_limite)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_searchbox_budget() FROM PUBLIC, anon;

SELECT cron.schedule(
  'searchbox-budget-alert',
  '0 12 * * *',
  $$SELECT public.notify_searchbox_budget();
SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/searchbox-budget-alert',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'searchbox_alert_cron_secret')
    ),
    timeout_milliseconds := 30000
  )$$
);

