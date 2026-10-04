-- talkx_tick_nao_aborta_no_expurgo
-- Rollback: 1) recriar public.purge_talkx_expired_data(integer), public.talkx_engine_alerts() e public.trigger_talkx_engine_tick() com os corpos de 20261003242707_talkx_log_saude_alertas.sql; 2) UPDATE public.talkx_alerts SET resolved_at = now() WHERE kind = 'purge_failed' AND resolved_at IS NULL; DELETE FROM public.talkx_alerts WHERE kind = 'purge_failed'; ALTER TABLE public.talkx_alerts DROP CONSTRAINT talkx_alerts_kind_check, ADD CONSTRAINT talkx_alerts_kind_check CHECK (kind IN ('stalled_campaign','stale_lease','outcome_unknown','high_failure_rate','cron_degraded')); 3) DROP TABLE IF EXISTS public.talkx_storage_purge_queue; 4) DELETE FROM public.talkx_settings WHERE key = 'last_purge_attempt_at';
--
-- M-DB-01 (= R3-DELTA-006/007, P0). O motor do Talk X parou: o cron talkx-scheduler-1min
-- falha em toda execucao desde 04/10 03:07 UTC.
--
-- CAUSA: trigger_talkx_engine_tick() chama purge_talkx_expired_data() antes de tudo e fora de
-- bloco de excecao. O passo 5 do expurgo (X033) faz DELETE FROM storage.objects, e o gatilho
-- storage.protect_delete (BEFORE DELETE ... FOR EACH STATEMENT) levanta 42501 mesmo com 0
-- linhas. A transacao inteira do tick reverte; last_purge_at nunca e gravado, entao o gate
-- diario fica sempre aberto e o tick seguinte falha de novo.
--
-- FAZER (esta migration):
--   1) o expurgo NAO apaga mais em storage.objects: registra os objetos orfaos de talkx-media
--      num manifesto (public.talkx_storage_purge_queue, so service_role) para uma Edge Function
--      apagar depois pela Storage API. O expurgo termina e grava last_purge_at;
--   2) o tick envolve o expurgo em BEGIN ... EXCEPTION: falha vira alerta 'purge_failed' (CHECK
--      estendido), grava last_purge_attempt_at e so tenta de novo depois de 1 h; expurgo que roda
--      de verdade fecha o 'purge_failed' aberto. talkx_engine_alerts() nao fecha 'purge_failed'
--      sozinho (senao o alerta pisca a cada 5 min);
--   3) talkx_engine_alerts() traduz o sinal 'outcome_unknown_24h' da view para o kind
--      'outcome_unknown' aceito pelo CHECK (antes o INSERT violava o CHECK e a falha era engolida
--      pelo EXCEPTION do tick);
--   4) as tres funcoes com search_path = public, pg_temp. Nao usa storage.allow_delete_query.
--
-- REGRA DE RECONSTRUCAO: os corpos das tres funcoes foram COPIADOS VIVOS de
-- 20261003242707_talkx_log_saude_alertas.sql e SO o delta acima foi aplicado.
--
-- Classe: CONTRATO (CREATE TABLE + ALTER TABLE ... CONSTRAINT + CREATE OR REPLACE FUNCTION + ACL).
-- Idempotente/replayavel: CREATE TABLE/INDEX IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE OR REPLACE.

-- ============================================================================
-- (1a) manifesto de objetos do Storage a apagar pela Storage API
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.talkx_storage_purge_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id    text NOT NULL,
  object_name  text NOT NULL,
  object_id    uuid,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  processed_at timestamptz,
  CONSTRAINT talkx_storage_purge_queue_attempts_check CHECK (attempts >= 0)
);

-- Um pedido pendente por objeto: o expurgo de cada dia nao reenfileira o que ja esta na fila.
CREATE UNIQUE INDEX IF NOT EXISTS talkx_storage_purge_queue_pending_uniq
  ON public.talkx_storage_purge_queue (bucket_id, object_name)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS talkx_storage_purge_queue_pending_idx
  ON public.talkx_storage_purge_queue (enqueued_at)
  WHERE processed_at IS NULL;

-- RLS ligada e SEM policy: so service_role (BYPASSRLS) le e escreve; anon/authenticated nao
-- tem grant nem policy.
ALTER TABLE public.talkx_storage_purge_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talkx_storage_purge_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.talkx_storage_purge_queue TO service_role;

COMMENT ON TABLE public.talkx_storage_purge_queue IS
  'M-DB-01: manifesto dos objetos do Storage (talkx-media orfaos) que o expurgo LGPD marcou para apagar. O banco NAO apaga em storage.objects (storage.protect_delete recusa); uma Edge Function apaga pela Storage API e preenche processed_at. Acesso so service_role.';

-- ============================================================================
-- (2a) CHECK de talkx_alerts aceita 'purge_failed'
-- ============================================================================
ALTER TABLE public.talkx_alerts
  DROP CONSTRAINT IF EXISTS talkx_alerts_kind_check,
  ADD CONSTRAINT talkx_alerts_kind_check CHECK (kind IN
    ('stalled_campaign', 'stale_lease', 'outcome_unknown', 'high_failure_rate', 'cron_degraded', 'purge_failed'));

-- ============================================================================
-- (3) talkx_engine_alerts(): kind traduzido e 'purge_failed' fora do fechamento automatico
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_engine_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_firing   jsonb := '[]'::jsonb;
  v_opened   integer := 0;
  v_resolved integer := 0;
  v_cron_bad boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- Sinais que disparam alerta AGORA (kind de alerta + campanha).
  -- M-DB-01: a view emite 'outcome_unknown_24h'; o kind do alerta (CHECK) e 'outcome_unknown'.
  WITH signals AS (
    SELECT CASE h.kind WHEN 'outcome_unknown_24h' THEN 'outcome_unknown' ELSE h.kind END AS kind,
           h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind IN ('stalled_campaign', 'outcome_unknown_24h')
    UNION
    SELECT 'stale_lease'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'stale_lease'
    UNION
    SELECT 'high_failure_rate'::text, h.campaign_id
      FROM public.talkx_engine_health AS h
     WHERE h.kind = 'failure_rate_15m'
       AND COALESCE(h.metric_count, 0) >= 5
       AND COALESCE(h.metric_rate, 0) >= 0.5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'campaign_id', s.campaign_id)), '[]'::jsonb)
    INTO v_firing
    FROM signals AS s;

  -- cron_degraded: ultimas 3 execucoes do cron do Talk X todas falhas (ex.: job startup timeout).
  SELECT (count(*) = 3 AND bool_and(r.status = 'failed'))
    INTO v_cron_bad
    FROM (
      SELECT cr.status
        FROM public.talkx_engine_cron_runs(3) AS cr
       ORDER BY cr.start_time DESC NULLS LAST, cr.runid DESC
       LIMIT 3
    ) AS r;
  IF COALESCE(v_cron_bad, false) THEN
    v_firing := v_firing || jsonb_build_array(jsonb_build_object('kind', 'cron_degraded', 'campaign_id', NULL));
  END IF;

  -- 1) abrir alertas novos (dedup pelo indice parcial unico; ON CONFLICT DO NOTHING).
  INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
  SELECT (s ->> 'kind'),
         NULLIF(s ->> 'campaign_id', '')::uuid,
         jsonb_build_object('detected_at', v_now, 'source', 'talkx_engine_health')
    FROM jsonb_array_elements(v_firing) AS s
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  -- 2) fechar alertas cujo sinal deixou de disparar (fechamento automatico).
  --    M-DB-01: 'purge_failed' nao vem da view; quem fecha e o tick, quando o expurgo roda.
  UPDATE public.talkx_alerts AS a
     SET resolved_at = v_now
   WHERE a.resolved_at IS NULL
     AND a.kind <> 'purge_failed'
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_firing) AS s
        WHERE (s ->> 'kind') = a.kind
          AND COALESCE(NULLIF(s ->> 'campaign_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(a.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
     );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN jsonb_build_object(
    'opened', v_opened,
    'resolved', v_resolved,
    'firing', v_firing,
    'at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_engine_alerts() TO service_role;

COMMENT ON FUNCTION public.talkx_engine_alerts() IS
  'X033 + M-DB-01: avalia talkx_engine_health e abre/fecha talkx_alerts. Dedup por (tipo, campanha); fecha sozinho o alerta que parou de disparar, exceto purge_failed (fechado pelo tick). O sinal outcome_unknown_24h vira o kind outcome_unknown. Chamada pelo trigger_talkx_engine_tick a cada 5 min. So service_role.';

-- ============================================================================
-- (1b) expurgo LGPD: objetos orfaos vao para o manifesto (corpo vivo 20261003242707 + delta)
-- ============================================================================
-- Uma vez por dia (controle em talkx_settings.last_purge_at, dia de calendario em
-- America/Sao_Paulo): na segunda execucao do mesmo dia devolve contagens zeradas sem tocar
-- em nada. Nunca apaga talkx_blacklist, contadores nem eventos.
CREATE OR REPLACE FUNCTION public.purge_talkx_expired_data(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_days_message integer;
  v_days_clicks  integer;
  v_days_test    integer;
  v_days_ai      integer;
  v_now          timestamptz := statement_timestamp();
  v_last         timestamptz;
  v_msg          integer := 0;
  v_clicks       integer := 0;
  v_test         integer := 0;
  v_ai           integer := 0;
  v_media        integer := 0;
  v_log          integer := 0;
  v_events       integer := 0;
  v_entity_id    uuid := gen_random_uuid();
  v_counts       jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'invalid_talkx_purge_limit' USING ERRCODE = '22023';
  END IF;

  SELECT (settings.value #>> '{}')::timestamptz
    INTO v_last
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'last_purge_at';

  -- Gate diario: se o ultimo expurgo foi hoje (America/Sao_Paulo), nao roda de novo.
  IF v_last IS NOT NULL
     AND (v_last AT TIME ZONE 'America/Sao_Paulo')::date
         = (v_now AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object(
      'skipped', true, 'messages', 0, 'clicks', 0, 'test_sends', 0, 'ai', 0, 'media', 0, 'delivery_log', 0
    );
  END IF;

  SELECT (settings.value #>> '{}')::integer INTO v_days_message
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_message';
  SELECT (settings.value #>> '{}')::integer INTO v_days_clicks
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_clicks';
  SELECT (settings.value #>> '{}')::integer INTO v_days_test
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_test_sends';
  SELECT (settings.value #>> '{}')::integer INTO v_days_ai
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_ai';
  v_days_message := COALESCE(v_days_message, 180);
  v_days_clicks  := COALESCE(v_days_clicks, 365);
  v_days_test    := COALESCE(v_days_test, 90);
  v_days_ai      := COALESCE(v_days_ai, 90);

  -- 1) texto e snapshots de midia dos destinatarios de campanhas TERMINAIS vencidas
  WITH terminal AS (
    SELECT recipient.id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.status IN ('completed', 'cancelled')
       AND COALESCE(campaign.completed_at, campaign.cancelled_at, campaign.updated_at)
           < v_now - make_interval(days => v_days_message)
       AND (recipient.personalized_message IS NOT NULL
            OR recipient.media_url_snapshot IS NOT NULL
            OR recipient.media_type_snapshot IS NOT NULL)
     ORDER BY recipient.id
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  )
  UPDATE public.talkx_recipients AS recipient
     SET personalized_message = NULL,
         media_url_snapshot = NULL,
         media_type_snapshot = NULL,
         updated_at = v_now
    FROM terminal
   WHERE recipient.id = terminal.id;
  GET DIAGNOSTICS v_msg = ROW_COUNT;

  -- 2) ua/ip_hash de cliques vencidos
  WITH vencidos AS (
    SELECT click.id
      FROM public.talkx_link_clicks AS click
     WHERE click.clicked_at < v_now - make_interval(days => v_days_clicks)
       AND (click.ua IS NOT NULL OR click.ip_hash IS NOT NULL)
     ORDER BY click.id
     LIMIT p_limit
     FOR UPDATE OF click SKIP LOCKED
  )
  UPDATE public.talkx_link_clicks AS click
     SET ua = NULL,
         ip_hash = NULL
    FROM vencidos
   WHERE click.id = vencidos.id;
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  -- 3) linhas vencidas de teste (envio de teste)
  IF to_regclass('public.talkx_test_send_claims') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT claim.id
        FROM public.talkx_test_send_claims AS claim
       WHERE claim.created_at < v_now - make_interval(days => v_days_test)
       ORDER BY claim.id
       LIMIT p_limit
    )
    DELETE FROM public.talkx_test_send_claims AS claim
     USING vencidos
     WHERE claim.id = vencidos.id;
    GET DIAGNOSTICS v_test = ROW_COUNT;
  END IF;

  -- 4) linhas vencidas de IA (jobs terminais antigos)
  IF to_regclass('public.ai_jobs') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT job.id
        FROM public.ai_jobs AS job
       WHERE job.status IN ('succeeded', 'failed', 'cancelled', 'outcome_unknown')
         AND COALESCE(job.finished_at, job.created_at) < v_now - make_interval(days => v_days_ai)
       ORDER BY job.id
       LIMIT p_limit
    )
    DELETE FROM public.ai_jobs AS job
     USING vencidos
     WHERE job.id = vencidos.id;
    GET DIAGNOSTICS v_ai = ROW_COUNT;
  END IF;

  -- 5) objetos de talkx-media sem referencia (bucket ainda pode nao existir; guarded).
  -- M-DB-01: o banco NAO apaga em storage.objects (storage.protect_delete recusa o DELETE e
  -- derrubava o tick). Os orfaos entram no manifesto talkx_storage_purge_queue e uma Edge
  -- Function apaga pela Storage API; 'media' passa a contar os objetos enfileirados.
  -- Referencia a storage.objects so aparece em SQL dinamico/EXECUTE para nao falhar o
  -- parse da funcao quando o schema storage nao existe (PostgreSQL descartavel).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE format($media$
      INSERT INTO public.talkx_storage_purge_queue (bucket_id, object_name, object_id)
      SELECT object.bucket_id, object.name, object.id
        FROM storage.objects AS object
       WHERE object.bucket_id = 'talkx-media'
         AND object.created_at < %L::timestamptz - make_interval(days => %s)
         AND NOT EXISTS (
           SELECT 1 FROM public.talkx_campaigns AS campaign
            WHERE campaign.media_url LIKE '%%/' || object.name
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.talkx_recipients AS recipient
            WHERE recipient.media_url_snapshot LIKE '%%/' || object.name
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.talkx_storage_purge_queue AS queued
            WHERE queued.bucket_id = object.bucket_id
              AND queued.object_name = object.name
              AND queued.processed_at IS NULL
         )
       ORDER BY object.id
       LIMIT %s
      ON CONFLICT DO NOTHING
    $media$, v_now, v_days_message, p_limit);
    GET DIAGNOSTICS v_media = ROW_COUNT;
  END IF;

  -- 6) X033: log de entrega por destinatario vencido (30 dias, prazo proprio do X033).
  WITH vencidos AS (
    SELECT log.id
      FROM public.talkx_delivery_log AS log
     WHERE log.created_at < v_now - interval '30 days'
     ORDER BY log.id
     LIMIT p_limit
  )
  DELETE FROM public.talkx_delivery_log AS log
   USING vencidos
   WHERE log.id = vencidos.id;
  GET DIAGNOSTICS v_log = ROW_COUNT;

  -- Marca o expurgo do dia ANTES do evento, para o gate valer mesmo se o INSERT falhar.
  INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at)
  VALUES ('last_purge_at', to_jsonb(v_now::text), 'X032: instante do ultimo expurgo.', v_now)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  v_counts := jsonb_build_object(
    'skipped', false,
    'messages', v_msg,
    'clicks', v_clicks,
    'test_sends', v_test,
    'ai', v_ai,
    'media', v_media,
    'delivery_log', v_log
  );

  -- Evento com as contagens (campanha nula => evento de entidade, respeita o target_check).
  INSERT INTO public.talkx_campaign_events
    (campaign_id, event_type, message, actor_id, entity_type, entity_id)
  VALUES (NULL, 'note', v_counts::text, NULL, 'talkx_lgpd_purge', v_entity_id);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN v_counts || jsonb_build_object('events', v_events);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_talkx_expired_data(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_talkx_expired_data(integer)
  TO service_role;

COMMENT ON FUNCTION public.purge_talkx_expired_data(integer) IS
  'Talk X (X032 + X033 + M-DB-01): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, de IA e (X033) do talkx_delivery_log acima de 30 dias; objetos de talkx-media orfaos vao para o manifesto talkx_storage_purge_queue (nao apaga em storage.objects); grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- (2b) tick: expurgo em bloco de excecao com alerta e nova tentativa so depois de 1 h
--      (corpo vivo 20261003242707 + delta)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_talkx_engine_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign_id      uuid;
  v_scheduler_url    text;
  v_anon_key         text;
  v_cron_secret      text;
  v_purge_attempt_at timestamptz;
  v_purge            jsonb;
  v_err_state        text;
  v_err_message      text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- X032: expurgo LGPD — a propria funcao se limita a 1x/dia (last_purge_at).
  -- M-DB-01: uma falha no expurgo nunca derruba o tick. Vira alerta 'purge_failed', grava
  -- last_purge_attempt_at e so tenta de novo depois de 1 h. Expurgo que roda de verdade
  -- (nao barrado pelo gate diario) fecha o 'purge_failed' aberto.
  SELECT (settings.value #>> '{}')::timestamptz
    INTO v_purge_attempt_at
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'last_purge_attempt_at';

  IF v_purge_attempt_at IS NULL OR v_purge_attempt_at <= now() - interval '1 hour' THEN
    BEGIN
      v_purge := public.purge_talkx_expired_data(1000);
      IF NOT COALESCE((v_purge ->> 'skipped')::boolean, false) THEN
        UPDATE public.talkx_alerts
           SET resolved_at = now()
         WHERE kind = 'purge_failed'
           AND resolved_at IS NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_message = MESSAGE_TEXT;

      INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at)
      VALUES ('last_purge_attempt_at', to_jsonb(now()::text),
              'M-DB-01: instante da ultima tentativa de expurgo que falhou (o tick so tenta de novo depois de 1 h).', now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

      INSERT INTO public.talkx_alerts (kind, campaign_id, payload)
      VALUES ('purge_failed', NULL,
              jsonb_build_object('detected_at', now(), 'source', 'trigger_talkx_engine_tick',
                                 'sqlstate', v_err_state, 'message', left(v_err_message, 500)))
      ON CONFLICT DO NOTHING;
    END;
  END IF;

  -- X033: alertas do motor a cada 5 min (minutos 0,5,10,...). Best-effort: uma falha
  -- na avaliacao de saude nunca pode derrubar o fan-out do motor.
  IF EXTRACT(minute FROM now())::integer % 5 = 0 THEN
    BEGIN
      PERFORM public.talkx_engine_alerts();
    EXCEPTION WHEN OTHERS THEN
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
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_talkx_engine_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_talkx_engine_tick() TO service_role;

-- ============================================================================
-- Fail-closed: se qualquer objeto do contrato nao colar, aborta.
-- ============================================================================
DO $mdb01_guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_storage_purge_queue'),
      ('public.talkx_engine_alerts()'),
      ('public.purge_talkx_expired_data(integer)'),
      ('public.trigger_talkx_engine_tick()')
  ) AS esperado(assinatura)
  WHERE to_regclass(assinatura) IS NULL
    AND to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_mdb01_objetos_ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'talkx_alerts_kind_check'
       AND conrelid = 'public.talkx_alerts'::regclass
       AND pg_get_constraintdef(oid) LIKE '%purge_failed%'
  ) THEN
    RAISE EXCEPTION 'talkx_mdb01_objetos_ausentes: talkx_alerts_kind_check sem purge_failed';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talkx_storage_purge_queue'::regclass) THEN
    RAISE EXCEPTION 'talkx_mdb01_objetos_ausentes: RLS desligada em talkx_storage_purge_queue';
  END IF;
END;
$mdb01_guard$;
