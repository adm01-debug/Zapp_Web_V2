CREATE OR REPLACE FUNCTION public.searchbox_budget_alert_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mes     text;
  v_sessoes integer;
  v_limite  integer := 400;
  v_count   integer;
  v_linhas  integer;
  v_claim   boolean := false;
  v_url     text;
  v_request bigint;
BEGIN
  -- Canal 1 (app): inalterado.
  v_count := public.notify_searchbox_budget();

  v_mes := to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM');

  SELECT coalesce(sum(sessoes), 0) INTO v_sessoes
  FROM public.searchbox_usage_daily
  WHERE dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

  IF v_sessoes < v_limite THEN
    RETURN v_count;
  END IF;

  -- Canal 2 (e-mail): reivindicacao ATOMICA do mes ANTES de qualquer envio.
  -- A PK (mes) e a trava: a linha do mes so nasce uma vez.
  INSERT INTO public.searchbox_budget_alert_emails (mes, sessoes, status, attempt_count)
  VALUES (v_mes, v_sessoes, 'pending', 1)
  ON CONFLICT (mes) DO NOTHING;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas = 1 THEN
    v_claim := true;
  ELSE
    -- Mes ja reivindicado: so falha CONFIRMADA libera nova tentativa. O UPDATE e guardado
    -- por status='failed' e trava a linha, entao duas execucoes concorrentes nao enviam duas vezes.
    UPDATE public.searchbox_budget_alert_emails
       SET status        = 'pending',
           attempt_count = attempt_count + 1,
           sessoes       = v_sessoes,
           last_error    = NULL,
           updated_at    = now()
     WHERE mes = v_mes
       AND status = 'failed';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 1 THEN
      v_claim := true;
    END IF;
  END IF;

  IF NOT v_claim THEN
    RETURN v_count;
  END IF;

  SELECT url INTO v_url FROM public.searchbox_budget_alert_cron WHERE id;
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'canal de e-mail do alerta de custo sem alvo configurado';
  END IF;

  v_request := net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'searchbox_alert_cron_secret')
    ),
    timeout_milliseconds := 30000
  );

  UPDATE public.searchbox_budget_alert_emails
     SET request_id = v_request,
         updated_at = now()
   WHERE mes = v_mes;

  RETURN v_count;
END;
$function$
