-- talkx_expurgo_drena_lotes
-- Rollback: recriar public.purge_talkx_expired_data(integer) com o corpo vivo de
--   20261004173439_talkx_tick_nao_aborta_no_expurgo.sql (um lote unico de p_limit linhas
--   por passo por chamada). Nada mais desta migration precisa ser desfeito: ela so
--   substitui a funcao e o COMMENT dela.
--
-- R3-DELTA-008 (P2, area migrations). Defeito: o expurgo LGPD do Talk X fazia UM unico
-- lote de p_limit linhas por passo e, em seguida, fechava o dia (last_purge_at). Com acervo
-- vencido maior que o lote — o caso normal quando uma campanha de dezenas de milhares de
-- destinatarios vence de uma vez — o texto e os snapshots de midia seguiam guardados MUITO
-- alem do prazo de retencao: um acervo de 100 mil destinatarios levava ~100 dias para ser
-- expurgado, e o backlog crescia mais rapido do que o expurgo drenava. A prova antiga
-- (§6 do scripts/db-audit/talkx-lgpd.test.sh) exercitava 1-2 linhas, entao nao enxergava o
-- defeito: lote unico nao prova a retencao em volume.
-- marcador (procurado pelo scripts/db-audit/talkx-lgpd.test.sh): talkx_r3delta008_laco_ausente
--
-- FAZER (esta migration): cada um dos 6 passos passa a DRENAR o acervo vencido em lotes de
-- p_limit linhas ate terminar (LOOP ... EXIT WHEN <linhas do lote> < p_limit). p_limit deixa
-- de ser o TETO diario e passa a ser o TAMANHO DO LOTE; o gate diario (last_purge_at)
-- continua valendo — o expurgo segue rodando no maximo 1x/dia, mas agora a execucao do dia
-- vai ate o fim do acervo vencido. O laco termina sempre: cada passo deixa de casar o
-- proprio filtro depois de aplicar (o texto/midia viram NULL, ua/ip_hash viram NULL, as
-- linhas de teste/IA/log sao apagadas e o objeto de midia entra no manifesto
-- talkx_storage_purge_queue, que o filtro NOT EXISTS exclui na rodada seguinte).
--
-- Contrato mantido: mesma assinatura purge_talkx_expired_data(integer), mesmas chaves de
-- retorno (a contagem de cada chave agora soma TODOS os lotes do dia), o evento
-- talkx_lgpd_purge continua sendo um por execucao, e continuam intactos talkx_blacklist,
-- contadores e eventos.
--
-- Classe: FUNCAO (CREATE OR REPLACE apenas). Idempotente/replayavel.
-- Corpo copiado VIVO de 20261004173439_talkx_tick_nao_aborta_no_expurgo.sql; so o laco de
-- drenagem foi aplicado a cada passo.

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
  v_lote         integer;   -- R3-DELTA-008: linhas do lote corrente (p_limit = tamanho do lote)
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

  -- 1) texto e snapshots de midia dos destinatarios de campanhas TERMINAIS vencidas.
  -- R3-DELTA-008: drena em lotes de p_limit; o UPDATE tira as linhas do filtro, entao
  -- o laco termina quando o lote vier incompleto.
  LOOP
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
    GET DIAGNOSTICS v_lote = ROW_COUNT;
    v_msg := v_msg + v_lote;
    EXIT WHEN v_lote < p_limit;
  END LOOP;

  -- 2) ua/ip_hash de cliques vencidos (drena em lotes).
  LOOP
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
    GET DIAGNOSTICS v_lote = ROW_COUNT;
    v_clicks := v_clicks + v_lote;
    EXIT WHEN v_lote < p_limit;
  END LOOP;

  -- 3) linhas vencidas de teste (envio de teste) — drena em lotes.
  IF to_regclass('public.talkx_test_send_claims') IS NOT NULL THEN
    LOOP
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
      GET DIAGNOSTICS v_lote = ROW_COUNT;
      v_test := v_test + v_lote;
      EXIT WHEN v_lote < p_limit;
    END LOOP;
  END IF;

  -- 4) linhas vencidas de IA (jobs terminais antigos) — drena em lotes.
  IF to_regclass('public.ai_jobs') IS NOT NULL THEN
    LOOP
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
      GET DIAGNOSTICS v_lote = ROW_COUNT;
      v_ai := v_ai + v_lote;
      EXIT WHEN v_lote < p_limit;
    END LOOP;
  END IF;

  -- 5) M-DB-01: objetos de talkx-media sem referencia vao para o manifesto
  -- public.talkx_storage_purge_queue (a Edge Function apaga pela Storage API). O banco NAO
  -- apaga em storage.objects: storage.protect_delete levanta 42501 em qualquer DELETE direto.
  -- Referencia a storage.objects so aparece em SQL dinamico/EXECUTE para nao falhar o
  -- parse da funcao quando o schema storage nao existe (PostgreSQL descartavel).
  -- R3-DELTA-008: drena em lotes; o objeto enfileirado deixa de casar o filtro NOT EXISTS
  -- (pendente) e o ON CONFLICT DO NOTHING nao recontaria o mesmo objeto.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    LOOP
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
      GET DIAGNOSTICS v_lote = ROW_COUNT;
      v_media := v_media + v_lote;
      EXIT WHEN v_lote < p_limit;
    END LOOP;
  END IF;

  -- 6) X033: log de entrega por destinatario vencido (30 dias, prazo proprio do X033)
  -- — drena em lotes.
  LOOP
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
    GET DIAGNOSTICS v_lote = ROW_COUNT;
    v_log := v_log + v_lote;
    EXIT WHEN v_lote < p_limit;
  END LOOP;

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
  'Talk X (X032 + X033 + M-DB-01 + R3-DELTA-008): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at) e, na execucao do dia, DRENA em lotes de p_limit linhas ate acabar o acervo vencido (p_limit = tamanho do lote, nao teto diario): anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste, de IA e (X033) do talkx_delivery_log acima de 30 dias; objetos de talkx-media orfaos vao para talkx_storage_purge_queue (contagem em media) para a Storage API apagar — nunca DELETE em storage.objects. Grava UM evento com as contagens do dia. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- Fail-closed: a funcao tem de continuar existindo com o laco de drenagem.
-- ============================================================================
DO $r3delta008_guard$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.purge_talkx_expired_data(integer)') IS NULL THEN
    RAISE EXCEPTION 'talkx_r3delta008_funcao_ausente: public.purge_talkx_expired_data(integer)';
  END IF;

  v_def := pg_get_functiondef('public.purge_talkx_expired_data(integer)'::regprocedure);

  IF position('EXIT WHEN v_lote < p_limit' IN v_def) = 0 THEN
    RAISE EXCEPTION 'talkx_r3delta008_laco_ausente: purge_talkx_expired_data sem o laco de drenagem por lote';
  END IF;
END;
$r3delta008_guard$;
