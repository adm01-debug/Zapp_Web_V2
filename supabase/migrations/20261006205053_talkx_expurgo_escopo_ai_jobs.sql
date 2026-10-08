-- talkx_expurgo_escopo_ai_jobs
-- Rollback: UPDATE public.talkx_settings SET description = 'X032: dias de retencao de linhas terminais de IA (ai_jobs).' WHERE key = 'retention_days_ai'; CREATE OR REPLACE FUNCTION public.purge_talkx_expired_data(p_limit integer DEFAULT 1000) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_days_message integer; v_days_clicks integer; v_days_test integer; v_days_ai integer; v_now timestamptz := statement_timestamp(); v_last timestamptz; v_msg integer := 0; v_clicks integer := 0; v_test integer := 0; v_ai integer := 0; v_media integer := 0; v_log integer := 0; v_events integer := 0; v_entity_id uuid := gen_random_uuid(); v_counts jsonb; BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF; IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'invalid_talkx_purge_limit' USING ERRCODE = '22023'; END IF; SELECT (settings.value #>> '{}')::timestamptz INTO v_last FROM public.talkx_settings AS settings WHERE settings.key = 'last_purge_at'; IF v_last IS NOT NULL AND (v_last AT TIME ZONE 'America/Sao_Paulo')::date = (v_now AT TIME ZONE 'America/Sao_Paulo')::date THEN RETURN jsonb_build_object( 'skipped', true, 'messages', 0, 'clicks', 0, 'test_sends', 0, 'ai', 0, 'media', 0, 'delivery_log', 0 ); END IF; SELECT (settings.value #>> '{}')::integer INTO v_days_message FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_message'; SELECT (settings.value #>> '{}')::integer INTO v_days_clicks FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_clicks'; SELECT (settings.value #>> '{}')::integer INTO v_days_test FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_test_sends'; SELECT (settings.value #>> '{}')::integer INTO v_days_ai FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_ai'; v_days_message := COALESCE(v_days_message, 180); v_days_clicks := COALESCE(v_days_clicks, 365); v_days_test := COALESCE(v_days_test, 90); v_days_ai := COALESCE(v_days_ai, 90); WITH terminal AS ( SELECT recipient.id FROM public.talkx_recipients AS recipient JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id WHERE campaign.status IN ('completed', 'cancelled') AND COALESCE(campaign.completed_at, campaign.cancelled_at, campaign.updated_at) < v_now - make_interval(days => v_days_message) AND (recipient.personalized_message IS NOT NULL OR recipient.media_url_snapshot IS NOT NULL OR recipient.media_type_snapshot IS NOT NULL) ORDER BY recipient.id LIMIT p_limit FOR UPDATE OF recipient SKIP LOCKED ) UPDATE public.talkx_recipients AS recipient SET personalized_message = NULL, media_url_snapshot = NULL, media_type_snapshot = NULL, updated_at = v_now FROM terminal WHERE recipient.id = terminal.id; GET DIAGNOSTICS v_msg = ROW_COUNT; WITH vencidos AS ( SELECT click.id FROM public.talkx_link_clicks AS click WHERE click.clicked_at < v_now - make_interval(days => v_days_clicks) AND (click.ua IS NOT NULL OR click.ip_hash IS NOT NULL) ORDER BY click.id LIMIT p_limit FOR UPDATE OF click SKIP LOCKED ) UPDATE public.talkx_link_clicks AS click SET ua = NULL, ip_hash = NULL FROM vencidos WHERE click.id = vencidos.id; GET DIAGNOSTICS v_clicks = ROW_COUNT; IF to_regclass('public.talkx_test_send_claims') IS NOT NULL THEN WITH vencidos AS ( SELECT claim.id FROM public.talkx_test_send_claims AS claim WHERE claim.created_at < v_now - make_interval(days => v_days_test) ORDER BY claim.id LIMIT p_limit ) DELETE FROM public.talkx_test_send_claims AS claim USING vencidos WHERE claim.id = vencidos.id; GET DIAGNOSTICS v_test = ROW_COUNT; END IF; IF to_regclass('public.ai_jobs') IS NOT NULL THEN WITH vencidos AS ( SELECT job.id FROM public.ai_jobs AS job WHERE job.status IN ('succeeded', 'failed', 'cancelled', 'outcome_unknown') AND COALESCE(job.finished_at, job.created_at) < v_now - make_interval(days => v_days_ai) ORDER BY job.id LIMIT p_limit ) DELETE FROM public.ai_jobs AS job USING vencidos WHERE job.id = vencidos.id; GET DIAGNOSTICS v_ai = ROW_COUNT; END IF; IF to_regclass('storage.objects') IS NOT NULL THEN EXECUTE format($media$ INSERT INTO public.talkx_storage_purge_queue (bucket_id, object_name, object_id, reason) SELECT object.bucket_id, object.name, object.id, 'talkx_media_orphan' FROM storage.objects AS object WHERE object.bucket_id = 'talkx-media' AND object.name IS NOT NULL AND object.created_at < %L::timestamptz - make_interval(days => %s) AND NOT EXISTS ( SELECT 1 FROM public.talkx_campaigns AS campaign WHERE campaign.media_url LIKE '%%/' || object.name ) AND NOT EXISTS ( SELECT 1 FROM public.talkx_recipients AS recipient WHERE recipient.media_url_snapshot LIKE '%%/' || object.name ) AND NOT EXISTS ( SELECT 1 FROM public.talkx_storage_purge_queue AS queued WHERE queued.bucket_id = object.bucket_id AND queued.object_name = object.name AND queued.processed_at IS NULL ) ORDER BY object.id LIMIT %s ON CONFLICT DO NOTHING $media$, v_now, v_days_message, p_limit); GET DIAGNOSTICS v_media = ROW_COUNT; END IF; WITH vencidos AS ( SELECT log.id FROM public.talkx_delivery_log AS log WHERE log.created_at < v_now - interval '30 days' ORDER BY log.id LIMIT p_limit ) DELETE FROM public.talkx_delivery_log AS log USING vencidos WHERE log.id = vencidos.id; GET DIAGNOSTICS v_log = ROW_COUNT; INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at) VALUES ('last_purge_at', to_jsonb(v_now::text), 'X032: instante do ultimo expurgo.', v_now) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at; v_counts := jsonb_build_object( 'skipped', false, 'messages', v_msg, 'clicks', v_clicks, 'test_sends', v_test, 'ai', v_ai, 'media', v_media, 'delivery_log', v_log ); INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id, entity_type, entity_id) VALUES (NULL, 'note', v_counts::text, NULL, 'talkx_lgpd_purge', v_entity_id); GET DIAGNOSTICS v_events = ROW_COUNT; RETURN v_counts || jsonb_build_object('events', v_events); END; $function$; REVOKE ALL ON FUNCTION public.purge_talkx_expired_data(integer) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.purge_talkx_expired_data(integer) TO service_role; COMMENT ON FUNCTION public.purge_talkx_expired_data(integer) IS 'Talk X (X032 + X033 + M-DB-01): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, de IA e (X033) do talkx_delivery_log acima de 30 dias; objetos de talkx-media orfaos vao para talkx_storage_purge_queue (contagem em media) para a Storage API apagar — nunca DELETE em storage.objects. Grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';
--
-- #130 (R3-DELTA-015) — o expurgo LGPD do Talk X apagava ai_jobs de OUTROS modulos.
--
-- DEFEITO: public.purge_talkx_expired_data(integer) (X032; corpo vivo desde a M-DB-01 /
-- 20261004173439) tem um passo que apaga TODA linha terminal vencida de public.ai_jobs,
-- sem olhar de quem e o job. ai_jobs e a fila DURAVEL COMPARTILHADA (IA-045): o worker de
-- IA enfileira 'ai.generate' e o inbox (message-delivery) enfileira a reconciliacao
-- 'reconcile:message.send:<id>'. Um expurgo diario do Talk X apagava, portanto, trabalho
-- de OUTROS modulos — a fila deles e dona deles, nao do Talk X.
--
-- CAUSA RAIZ: o passo 4 filtra so por status terminal + idade; falta o dono. O Talk X
-- enfileira na MESMA tabela pelo kind 'effect.reconcile' (IA-047) com a chave estavel
-- buildEffectReconcileKey(effect, sourceId) = 'reconcile:<efeito>:<id>'; o efeito do Talk X
-- e EFFECT_TALKX_RECIPIENT_SEND = 'talkx.recipient.send', logo a chave do job do Talk X
-- comeca com 'reconcile:talkx.' (supabase/functions/_shared/effect-reconcile.ts).
--
-- CORRECAO (esta migration): o passo 4 passa a exigir
-- job.idempotency_key LIKE 'reconcile:talkx.%'. Nada mais muda: status terminal, prazo
-- (retention_days_ai) e limite por lote seguem iguais. Jobs de outros modulos ficam
-- intactos; o job terminal vencido do PROPRIO Talk X continua sendo apagado.
--
-- NAO TOCA: nenhuma outra tabela, nenhum GRANT de terceiro, nenhum registro existente
-- alem da descricao do setting 'retention_days_ai' (abaixo), que passa a declarar o
-- escopo. Rolling back NAO devolve job apagado por uma execucao passada do expurgo
-- (nao ha copia) — a migration nova nao apaga nada por si so.
--
-- Classe: CONTRATO (CREATE OR REPLACE FUNCTION + ACL + COMMENT + descricao de setting).
-- Idempotente/replayavel: CREATE OR REPLACE, REVOKE/GRANT pela assinatura exata, UPDATE.
--
-- EVIDENCIA (Postgres 17 descartavel, migrations REAIS): com o corpo vivo da M-DB-01, um
-- expurgo apaga 'reconcile:message.send:<id>' e 'ai.generate' terminais vencidos (RED);
-- depois desta migration os dois seguem intactos e so o job do Talk X
-- 'reconcile:talkx.recipient.send:<id>' vencido e apagado (GREEN)
-- (scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh).

-- ============================================================================
-- (1) expurgo com escopo: so apaga job de IA do PROPRIO Talk X
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

  -- 4) linhas vencidas de IA (jobs terminais antigos) SOMENTE do Talk X.
  -- #130 (R3-DELTA-015): ai_jobs e a fila DURAVEL COMPARTILHADA (IA-045): a IA enfileira
  -- 'ai.generate' e o inbox (message-delivery) enfileira 'reconcile:message.send:<id>'.
  -- Este expurgo e do Talk X e nao pode apagar trabalho de outro modulo.
  -- O escopo e o namespace da chave de idempotencia do Talk X:
  -- buildEffectReconcileKey(effect, sourceId) = 'reconcile:<efeito>:<id>' com
  -- EFFECT_TALKX_RECIPIENT_SEND = 'talkx.recipient.send'
  -- (supabase/functions/_shared/effect-reconcile.ts) => 'reconcile:talkx.%'.
  -- Quem apaga a fila de IA e o dono dela; aqui so saem os jobs do PROPRIO Talk X.
  IF to_regclass('public.ai_jobs') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT job.id
        FROM public.ai_jobs AS job
       WHERE job.status IN ('succeeded', 'failed', 'cancelled', 'outcome_unknown')
         AND job.idempotency_key LIKE 'reconcile:talkx.%'
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
  'Talk X (X032 + X033 + M-DB-01 + #130): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, do talkx_delivery_log (30 dias) e, em ai_jobs, SOMENTE os jobs terminais vencidos do PROPRIO Talk X (idempotency_key com prefixo reconcile:talkx.); a fila de IA de outros modulos fica intacta. Objetos de talkx-media orfaos vao para talkx_storage_purge_queue para a Storage API apagar — nunca DELETE em storage.objects. Grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- (2) a descricao do setting de retencao passa a declarar o escopo
-- ============================================================================
UPDATE public.talkx_settings
   SET description = 'X032 + #130: dias de retencao das linhas TERMINAIS de ai_jobs do PROPRIO Talk X (prefixo de idempotency_key reconcile:talkx.); jobs de outros modulos nao entram aqui.'
 WHERE key = 'retention_days_ai';

-- ============================================================================
-- Fail-closed: se o escopo nao colou, aborta (marcador do teste).
-- ============================================================================
DO $escopo_ai_jobs$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.purge_talkx_expired_data(integer)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'talkx_purge_escopo_ai_jobs_ausente: funcao nao encontrada';
  END IF;
  IF position('reconcile:talkx.%' IN v_def) = 0 THEN
    RAISE EXCEPTION 'talkx_purge_escopo_ai_jobs_ausente: expurgo sem o escopo em ai_jobs';
  END IF;
  IF position('ai_jobs' IN v_def) = 0 THEN
    RAISE EXCEPTION 'talkx_purge_escopo_ai_jobs_ausente: o passo de ai_jobs sumiu (contrato mudou)';
  END IF;
END;
$escopo_ai_jobs$;
