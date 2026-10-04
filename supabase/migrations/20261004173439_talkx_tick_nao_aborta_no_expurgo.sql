-- talkx_tick_nao_aborta_no_expurgo
-- Rollback: ATENCAO, desfazer volta a parar o motor enquanto storage.protect_delete existir. 1) recriar public.purge_talkx_expired_data(integer), public.talkx_engine_alerts() e public.trigger_talkx_engine_tick() com os corpos de 20261003242707_talkx_log_saude_alertas.sql; 2) DELETE FROM public.talkx_alerts WHERE kind = 'purge_failed'; ALTER TABLE public.talkx_alerts DROP CONSTRAINT talkx_alerts_kind_check, ADD CONSTRAINT talkx_alerts_kind_check CHECK (kind IN ('stalled_campaign', 'stale_lease', 'outcome_unknown', 'high_failure_rate', 'cron_degraded')); 3) DELETE FROM public.talkx_settings WHERE key = 'last_purge_attempt_at'; 4) DROP TABLE IF EXISTS public.talkx_storage_purge_queue;
--
-- M-DB-01 (= R3-DELTA-006/007, P0). Motor do Talk X parado desde 04/10 03:07 UTC: o cron
-- talkx-scheduler-1min falha em toda execucao.
--
-- CAUSA: trigger_talkx_engine_tick() chama purge_talkx_expired_data() fora de bloco de
-- excecao; o passo 5 do expurgo (X033) faz DELETE FROM storage.objects e o gatilho
-- storage.protect_delete (BEFORE DELETE ... FOR EACH STATEMENT) levanta 42501 mesmo com 0
-- linhas. A transacao do tick inteira reverte, last_purge_at nunca e gravado e o gate diario
-- fica sempre aberto: todo tick tenta de novo e aborta de novo.
--
-- FAZER (esta migration):
--   1. expurgo: o passo 5 deixa de apagar em storage.objects e passa a registrar os objetos
--      orfaos de talkx-media no manifesto public.talkx_storage_purge_queue (RLS, so
--      service_role). Quem apaga e uma Edge Function pela Storage API (outro cartao). Sem o
--      DELETE o expurgo termina e grava last_purge_at; o tick seguinte e barrado pelo gate.
--   2. tick: a chamada do expurgo vai para BEGIN ... EXCEPTION WHEN OTHERS. Na falha grava
--      talkx_settings.last_purge_attempt_at e abre (ou atualiza) o alerta 'purge_failed'; so
--      tenta de novo depois de 1 h. Expurgo bem-sucedido fecha o alerta 'purge_failed' aberto.
--      O CHECK talkx_alerts_kind_check passa a aceitar 'purge_failed' (sem isso o INSERT do
--      handler falharia e o tick abortaria de novo). talkx_engine_alerts() nao fecha mais
--      'purge_failed' (o sinal nao vem da view de saude; fechar a cada 5 min e reabrir no
--      tick seguinte deixaria o alerta piscando).
--   3. talkx_engine_alerts(): a view emite 'outcome_unknown_24h' e o CHECK aceita
--      'outcome_unknown'; o sinal e traduzido antes do INSERT (e da comparacao do fechamento
--      automatico). Antes, qualquer outcome_unknown em 24 h violava o CHECK e a funcao inteira
--      falhava (engolida pelo EXCEPTION do tick), sem abrir alerta nenhum.
--   4. funcoes com search_path = public, pg_temp. Nao usa storage.allow_delete_query.
--
-- REGRA DE RECONSTRUCAO: os tres corpos foram copiados vivos de
-- 20261003242707_talkx_log_saude_alertas.sql e so o delta acima foi aplicado.
--
-- Idempotente/replayavel: CREATE TABLE/INDEX IF NOT EXISTS, DROP CONSTRAINT IF EXISTS,
-- CREATE OR REPLACE.

-- ============================================================================
-- (1a) manifesto de objetos do Storage a apagar pela Storage API
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.talkx_storage_purge_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id    text NOT NULL,
  object_name  text NOT NULL,
  object_id    uuid,
  reason       text NOT NULL DEFAULT 'talkx_media_orphan',
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  processed_at timestamptz,
  CONSTRAINT talkx_storage_purge_queue_attempts_check CHECK (attempts >= 0)
);

-- Um pedido pendente por objeto: o expurgo diario nao duplica o que ainda nao foi apagado.
CREATE UNIQUE INDEX IF NOT EXISTS talkx_storage_purge_queue_pending_dedup
  ON public.talkx_storage_purge_queue (bucket_id, object_name)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS talkx_storage_purge_queue_pending_idx
  ON public.talkx_storage_purge_queue (enqueued_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE public.talkx_storage_purge_queue IS
  'M-DB-01: manifesto de objetos do Storage que o expurgo LGPD do Talk X marcou para apagar (orfaos de talkx-media). O banco nao apaga em storage.objects (storage.protect_delete); uma Edge Function apaga pela Storage API e preenche processed_at. Acesso so service_role (RLS ligada, sem policy de proposito).';

ALTER TABLE public.talkx_storage_purge_queue ENABLE ROW LEVEL SECURITY;
-- Sem policy de proposito: so service_role (BYPASSRLS) le e escreve; anon/authenticated nao tem GRANT.
REVOKE ALL ON public.talkx_storage_purge_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.talkx_storage_purge_queue TO service_role;

-- ============================================================================
-- (2a) CHECK do tipo de alerta aceita 'purge_failed'
-- ============================================================================
ALTER TABLE public.talkx_alerts DROP CONSTRAINT IF EXISTS talkx_alerts_kind_check;
ALTER TABLE public.talkx_alerts ADD CONSTRAINT talkx_alerts_kind_check CHECK (kind IN
  ('stalled_campaign', 'stale_lease', 'outcome_unknown', 'high_failure_rate', 'cron_degraded', 'purge_failed'));

-- ============================================================================
-- (1b) expurgo LGPD sem DELETE em storage.objects (corpo vivo 20261003242707 + delta)
-- ============================================================================
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

  -- 5) M-DB-01: objetos de talkx-media sem referencia vao para o manifesto
  -- public.talkx_storage_purge_queue (a Edge Function apaga pela Storage API). O banco NAO
  -- apaga em storage.objects: storage.protect_delete levanta 42501 em qualquer DELETE direto.
  -- Referencia a storage.objects so aparece em SQL dinamico/EXECUTE para nao falhar o
  -- parse da funcao quando o schema storage nao existe (PostgreSQL descartavel).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE format($media$
      INSERT INTO public.talkx_storage_purge_queue (bucket_id, object_name, object_id, reason)
      SELECT object.bucket_id, object.name, object.id, 'talkx_media_orphan'
        FROM storage.objects AS object
       WHERE object.bucket_id = 'talkx-media'
         AND object.name IS NOT NULL
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
  'Talk X (X032 + X033 + M-DB-01): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, de IA e (X033) do talkx_delivery_log acima de 30 dias; objetos de talkx-media orfaos vao para talkx_storage_purge_queue (contagem em media) para a Storage API apagar — nunca DELETE em storage.objects. Grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- (3) talkx_engine_alerts(): kind traduzido e purge_failed fora do fechamento
--     automatico (corpo vivo 20261003242707 + delta)
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
    SELECT CASE WHEN h.kind = 'outcome_unknown_24h' THEN 'outcome_unknown' ELSE h.kind END AS kind,
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
  --    M-DB-01: 'purge_failed' nao vem da view de saude; quem fecha e o tick, no expurgo ok.
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
  'X033 + M-DB-01: avalia talkx_engine_health e abre/fecha talkx_alerts. Dedup por (tipo, campanha); fecha sozinho o alerta que parou de disparar (exceto purge_failed, fechado pelo tick). outcome_unknown_24h da view vira alerta outcome_unknown. Chamada pelo trigger_talkx_engine_tick a cada 5 min. So service_role.';

-- ============================================================================
-- (2b) tick do motor: expurgo isolado em bloco de excecao (corpo vivo 20261003242707 + delta)
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
  v_purge_sqlstate   text;
  v_purge_message    text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

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
-- Fail-closed: se qualquer peca do M-DB-01 nao colar, aborta.
-- ============================================================================
DO $mdb01_guard$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.talkx_storage_purge_queue') IS NULL THEN
    v_missing := concat_ws(', ', v_missing, 'public.talkx_storage_purge_queue');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.talkx_alerts'::regclass
       AND conname = 'talkx_alerts_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%purge_failed%'
  ) THEN
    v_missing := concat_ws(', ', v_missing, 'talkx_alerts_kind_check com purge_failed');
  END IF;
  IF position('DELETE FROM storage' IN pg_get_functiondef('public.purge_talkx_expired_data(integer)'::regprocedure)) > 0 THEN
    v_missing := concat_ws(', ', v_missing, 'purge_talkx_expired_data ainda apaga em storage.objects');
  END IF;
  IF position('purge_failed' IN pg_get_functiondef('public.trigger_talkx_engine_tick()'::regprocedure)) = 0 THEN
    v_missing := concat_ws(', ', v_missing, 'trigger_talkx_engine_tick sem o bloco de excecao do expurgo');
  END IF;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_mdb01_objetos_ausentes: %', v_missing;
  END IF;
END;
$mdb01_guard$;
