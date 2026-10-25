-- Fix: pg_cron talkx-scheduler-1min — 4.007 falhas em 30d (9,3%)
-- Três causas raiz:
-- C1: cron.job_run_details sem índice em (jobid, start_time) → varredura 69 MB → timeout de statement
-- C2: talkx_engine_cron_runs sem filtro de janela → 69 MB scan em todo SELECT da UI
-- C3: WHEN OTHERS não captura query_canceled (SQLSTATE 57014) no bloco de alertas
-- Bônus: advisory lock impede sobreposição de ticks quando um tick demora > 1 min

-- C1: índice composto — elimina seq scan em job_run_details para qualquer jobid
CREATE INDEX IF NOT EXISTS idx_job_run_details_jobid_start
  ON cron.job_run_details (jobid, start_time DESC, runid DESC);

-- Retenção: deleta runs com mais de 7 dias, evita crescimento ilimitado de 69 MB
SELECT cron.schedule(
  'cleanup-cron-run-details-7d',
  '0 4 * * *',
  'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''7 days'' AND end_time IS NOT NULL'
);

-- C2: janela de 14 dias no SELECT dinâmico — usa o índice acima
CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs(p_limit integer DEFAULT 60)
 RETURNS TABLE(runid bigint, jobid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jobid bigint;
  v_limit integer;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''talkx-scheduler-1min'' LIMIT 1' INTO v_jobid;
  END IF;
  IF v_jobid IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT runid, jobid, status, return_message, start_time, end_time
       FROM cron.job_run_details
      WHERE jobid = %L
        AND start_time > now() - interval ''14 days''
      ORDER BY start_time DESC NULLS LAST, runid DESC
      LIMIT %s', v_jobid, v_limit);
END;
$function$;

-- C3 + bônus: advisory lock impede sobreposição; WHEN query_canceled captura SQLSTATE 57014
CREATE OR REPLACE FUNCTION public.trigger_talkx_engine_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_campaign_id      uuid;
  v_scheduler_url    text;
  v_anon_key         text;
  v_cron_secret      text;
  v_purge_attempt_at timestamptz;
  v_purge_sqlstate   text;
  v_purge_message    text;
  v_purge_url        text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Advisory lock transacional: se um tick anterior ainda estiver rodando, skip.
  -- pg_try_advisory_xact_lock libera automaticamente no fim da transação.
  IF NOT pg_try_advisory_xact_lock(hashtext('trigger_talkx_engine_tick')) THEN
    RETURN;
  END IF;

  -- X032: expurgo LGPD — a propria funcao se limita a 1x/dia (last_purge_at).
  -- M-DB-01: falha no expurgo nunca derruba o tick. Vira alerta 'purge_failed', grava
  -- last_purge_attempt_at e so tenta de novo depois de 1 h. Expurgo ok fecha o alerta.
  BEGIN
    SELECT (settings.value #>> '{}')::timestamptz
      INTO v_purge_attempt_at
      FROM public.talkx_settings AS settings
     WHERE settings.key = 'last_purge_attempt_at';

    IF v_purge_attempt_at IS NULL OR v_purge_attempt_at <= now() - interval '1 hour' THEN
      PERFORM public.purge_talkx_expired_data(1000);

      UPDATE public.talkx_alerts AS alert
         SET resolved_at = now()
       WHERE alert.kind = 'purge_failed'
         AND alert.resolved_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_purge_sqlstate = RETURNED_SQLSTATE,
      v_purge_message  = MESSAGE_TEXT;
    BEGIN
      INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at)
      VALUES ('last_purge_attempt_at', to_jsonb(now()::text),
              'M-DB-01: instante da ultima tentativa de expurgo que falhou (nova tentativa so depois de 1 h).', now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

      INSERT INTO public.talkx_alerts AS alert (kind, campaign_id, payload)
      VALUES ('purge_failed', NULL, jsonb_build_object(
        'detected_at', now(),
        'last_failed_at', now(),
        'source', 'trigger_talkx_engine_tick',
        'sqlstate', v_purge_sqlstate,
        'message', left(v_purge_message, 500),
        'failures', 1
      ))
      ON CONFLICT (kind, (COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)))
        WHERE resolved_at IS NULL
      DO UPDATE SET payload = alert.payload || jsonb_build_object(
        'last_failed_at', now(),
        'sqlstate', v_purge_sqlstate,
        'message', left(v_purge_message, 500),
        'failures', COALESCE((alert.payload ->> 'failures')::integer, 1) + 1
      );
    EXCEPTION WHEN OTHERS THEN
      -- Nem o registro da falha pode derrubar o fan-out; fica no log do Postgres.
      RAISE WARNING 'talkx_purge_failed_nao_registrado: % (expurgo: % %)', SQLERRM, v_purge_sqlstate, v_purge_message;
    END;
  END;

  -- X033: alertas do motor a cada 5 min (minutos 0,5,10,...). Best-effort: uma falha
  -- na avaliacao de saude nunca pode derrubar o fan-out do motor.
  -- WHEN query_canceled adicionado: WHEN OTHERS nao captura SQLSTATE 57014.
  IF EXTRACT(minute FROM now())::integer % 5 = 0 THEN
    BEGIN
      PERFORM public.talkx_engine_alerts();
    EXCEPTION
      WHEN OTHERS THEN NULL
      WHEN query_canceled THEN NULL;
    END;
  END IF;

  -- 1) Fecha item preso (POST feito, lease expirado) ANTES de qualquer fan-out,
  --    senão a campanha nunca consegue drenar.
  PERFORM public.sweep_talkx_stuck_recipients(500);

  -- 2) Campanha 'sending' sem nenhum destinatário pendente/sending já drenou.
  FOR v_campaign_id IN
    SELECT campaign.id
      FROM public.talkx_campaigns AS campaign
     WHERE campaign.status = 'sending'
       AND NOT EXISTS (
         SELECT 1
           FROM public.talkx_recipients AS recipient
          WHERE recipient.campaign_id = campaign.id
            AND recipient.status IN ('pending', 'sending')
       )
     ORDER BY campaign.updated_at
  LOOP
    BEGIN
      PERFORM public.complete_talkx_campaign_if_drained(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      -- Uma campanha inválida não pode travar o tick.
      NULL;
    END;
  END LOOP;

  -- 3) Fan-out: no máximo UMA campanha 'sending' por conexão por tick (a de
  --    updated_at mais antigo), teto de 10 no tick. Antes, a edge podia levar
  --    N campanhas na MESMA instância — fan-out que derruba a sessão do WhatsApp.
  FOR v_campaign_id IN
    SELECT ranked.id
      FROM (
        SELECT campaign.id,
               row_number() OVER (
                 PARTITION BY COALESCE(campaign.whatsapp_connection_id::text, 'sem-conexao')
                 ORDER BY campaign.updated_at, campaign.id
               ) AS position
          FROM public.talkx_campaigns AS campaign
         WHERE campaign.status = 'sending'
      ) AS ranked
     WHERE ranked.position <= 1
     ORDER BY ranked.id
     LIMIT 10
  LOOP
    BEGIN
      PERFORM public.kick_talkx_campaign(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 4) Camada agendada: o talkx-scheduler resolve 'scheduled' e 'paused' dentro
  --    da janela. Mesmo segredo e mesmo timeout do kick.
  SELECT decrypted_secret INTO v_scheduler_url
    FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key' LIMIT 1;
  v_cron_secret := public.get_talkx_cron_secret();

  IF v_scheduler_url IS NOT NULL AND v_cron_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_scheduler_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END IF;

  -- QA5-05: drenagem da fila de expurgo de midia — POST best-effort para a edge
  -- talkx-storage-purge. A URL deriva do segredo que o tick JA le (sem literal de
  -- producao e sem segredo novo no Vault): se talkx_scheduler_url nao terminar
  -- em /talkx-scheduler o regexp nao casa, o resultado fica igual ao original e
  -- a chamada e pulada (fail-safe). Mesmos headers/segredo/timeout do POST ao
  -- scheduler. EXCEPTION WHEN OTHERS: a drenagem nunca pode derrubar o tick.
  v_purge_url := regexp_replace(v_scheduler_url, '/talkx-scheduler$', '/talkx-storage-purge');
  IF v_purge_url IS NOT NULL
     AND v_purge_url <> v_scheduler_url
     AND v_cron_secret IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_purge_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_anon_key,
          'Authorization', 'Bearer ' || v_anon_key,
          'x-cron-secret', v_cron_secret
        ),
        timeout_milliseconds := 30000
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$function$;
