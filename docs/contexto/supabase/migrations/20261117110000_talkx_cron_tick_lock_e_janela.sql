-- Resgate do trabalho de outro agente: branch claude/fix-talkx-cron-startup-timeout-261025-1700,
-- arquivo 20261026200300_fix-talkx-cron-startup-timeout.sql (nunca mergeado).
-- Diagnostico original: o cron `talkx-scheduler-1min` acumulou 4.007 falhas em 30 dias (9,3%).
--
-- O que desta migration entra, e por que:
--   C2  janela de 14 dias + desempate por runid em public.talkx_engine_cron_runs.
--       A definicao vigente (20261006193506_talkx_cron_runs_gate.sql:57-63, conferida ao vivo
--       em producao) le cron.job_run_details filtrando so por jobid, sem recorte de tempo, e
--       ordena por start_time DESC. Sem indice em (jobid, start_time) isso e sequencial sobre a
--       tabela inteira. A medicao registrada em
--       analise-prs/resgate-261115/auditoria/bruto/verificacoes/claude__fix-talkx-cron-startup-timeout-261025-1700.json
--       mostra 1.653 ms -> 0,94 ms ao ordenar por runid DESC, que usa a PRIMARY KEY que ja existe.
--   C3  WHEN query_canceled nos blocos best-effort de public.trigger_talkx_engine_tick.
--       `WHEN OTHERS` NAO captura SQLSTATE 57014 (query_canceled): por definicao do PL/pgSQL,
--       OTHERS exclui QUERY_CANCELED. Hoje um statement_timeout em qualquer sub-chamada
--       best-effort (alertas, drenagem, uma campanha ruim) aborta o tick inteiro, inclusive o
--       fan-out que ja tinha rodado.
--   BONUS advisory lock transacional em public.trigger_talkx_engine_tick.
--       Esta e a correcao de maior impacto para o negocio: sem ela, um tick que passa de 1 min
--       roda SOBREPOSTO ao seguinte, e os dois chamam kick_talkx_campaign para a MESMA campanha
--       -- o cliente recebe a mensagem duas vezes. pg_try_advisory_xact_lock e liberado
--       automaticamente no fim da transacao, logo nao deixa lock orfao se o tick morrer.
--
-- O que desta migration NAO entra, com motivo medido:
--   C1  `CREATE INDEX ... ON cron.job_run_details (jobid, start_time DESC, runid DESC)`.
--       NAO aplica neste projeto: o papel `postgres` do Supabase nao e superuser e nao tem
--       CREATE no schema `cron` (medido em producao e registrado no mesmo JSON de verificacao).
--       O ganho de C1 foi obtido por outro caminho, no proprio C2 (ordenar pela pkey).
--   Retencao de 7 dias em cron.job_run_details: JA esta na main, em
--       20261102022200_cron_historico_retencao_7d.sql:20 (job 'cron-historico-retencao-7d').
--       Reagendar criaria um segundo job fazendo o mesmo DELETE.
--
-- Corpo de trigger_talkx_engine_tick: copiado da definicao VIVA em producao
-- (pg_get_functiondef, 6.844 caracteres) e nao do arquivo da branch, que e anterior ao
-- QA5-05 e perderia o bloco de drenagem do talkx-storage-purge.

-- C2 ------------------------------------------------------------------------------------------
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

  -- `ORDER BY runid DESC` primeiro: runid e a PRIMARY KEY de cron.job_run_details, entao o
  -- plano usa o indice que ja existe em vez de varrer a tabela. A janela de 14 dias limita o
  -- que precisa ser lido mesmo quando o historico volta a crescer.
  RETURN QUERY EXECUTE format(
    'SELECT runid, jobid, status, return_message, start_time, end_time
       FROM cron.job_run_details
      WHERE jobid = %L
        AND start_time > now() - interval ''14 days''
      ORDER BY runid DESC
      LIMIT %s', v_jobid, v_limit);
END;
$function$

-- C3 + advisory lock -------------------------------------------------------------------------
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

  -- Lock transacional contra tick SOBREPOSTO: se o tick anterior ainda estiver rodando, este
  -- sai sem fazer nada. Sem isto, dois ticks simultaneos chamam kick_talkx_campaign para a
  -- mesma campanha e o contato recebe a mensagem em dobro. O lock e liberado no fim da
  -- transacao, inclusive quando o tick e cancelado por timeout.
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
  EXCEPTION
  -- 57014 nao e capturado por WHEN OTHERS sozinho, por isso vem nomeado aqui. Antes ele
  -- caia num `NULL`: o expurgo cancelado por timeout era engolido E o rollback do bloco
  -- descartava last_purge_attempt_at, entao o tick se declarava bem-sucedido e retentava o
  -- expurgo a cada minuto, para sempre, sem nunca abrir alerta de retencao (revisao do
  -- Codex nesta PR). Agora 57014 segue o mesmo caminho de registro do M-DB-01: grava a
  -- tentativa, abre 'purge_failed' e so tenta de novo depois de 1 h.
  -- Provado em Postgres 16 descartavel: mesmo depois do statement_timeout disparar, o
  -- handler ainda consegue gravar (57014 capturado, INSERT aplicado).
  WHEN query_canceled OR OTHERS THEN
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
  IF EXTRACT(minute FROM now())::integer % 5 = 0 THEN
    BEGIN
      PERFORM public.talkx_engine_alerts();
    EXCEPTION
    WHEN query_canceled THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
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
    EXCEPTION
    WHEN query_canceled THEN
      NULL;
    WHEN OTHERS THEN
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
    EXCEPTION
    WHEN query_canceled THEN
      NULL;
    WHEN OTHERS THEN
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
  -- scheduler. EXCEPTION: a drenagem nunca pode derrubar o tick.
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
    EXCEPTION
    WHEN query_canceled THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$function$
