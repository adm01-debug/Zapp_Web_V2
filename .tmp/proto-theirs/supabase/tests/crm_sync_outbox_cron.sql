-- crm_sync_outbox_cron
-- Prova da migration 20261016011302_crm_sync_outbox_cron.sql (achado HZ5-25: a fila
-- public.crm_sync_outbox tinha quem a alimentasse e quem a drenasse, mas nenhum job pg_cron).
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao; roda como postgres):
--   zapp-db-local psql . <conjunto> < supabase/tests/crm_sync_outbox_cron.sql
-- Sem a migration aplicada o teste FALHA na 1a prova (os dois jobs nao existem).
--
-- Tudo vive dentro de um BEGIN/ROLLBACK: nada fica no banco (nem os segredos de prova) e
-- NADA sai para a rede — o conjunto local tem pg_net.batch_size = 0 e o agendador desligado,
-- e a fila do pg_net e descartada pelo ROLLBACK.
--
-- O que se prova:
--   1. os dois jobs existem, com a agenda e o comando esperados;
--   2. flag 'crm.integration' desligada  => gate FALSE e nenhum dos dois jobs faz nada;
--   3. sem segredo no vault              => gate FALSE e o trigger NAO enfileira chamada (negado);
--   4. flag ligada + segredo no vault    => 1 chamada enfileirada, com a URL e o x-cron-secret do vault;
--   5. a drenagem respeita o lote e o max_attempts (excedido => dead_letter, nao re-tenta para sempre);
--      as linhas paradas sao 'failed' (o estado re-tentavel; NAO existe status 'retry') e 'pending';
--   6. a limpeza diaria: negada a quem nao e service_role e apaga so o que passou da retencao.

\set ON_ERROR_STOP on

BEGIN;

-- ---------- 1. jobs agendados ----------
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ausente neste banco: a prova dos jobs foi pulada';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'crm-sync-outbox'
      AND schedule = '1-59/2 * * * *'
      AND command LIKE '%public.trigger_crm_sync_outbox%'
  ) THEN
    RAISE EXCEPTION 'job crm-sync-outbox ausente ou fora da agenda/comando esperados';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'crm-sync-outbox-cleanup'
      AND schedule = '17 4 * * *'
      AND command LIKE '%public.run_crm_sync_outbox_cleanup%'
  ) THEN
    RAISE EXCEPTION 'job crm-sync-outbox-cleanup ausente ou fora da agenda/comando esperados';
  END IF;
END
$prova$;

-- ---------- 2. kill switch desligado: job inocuo ----------
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('crm.integration', false, 'kill switch da integracao CRM (prova)')
ON CONFLICT (key) DO UPDATE SET enabled = false;

DO $prova$
DECLARE
  v_ret integer;
BEGIN
  IF public.crm_sync_outbox_cron_enabled() IS NOT FALSE THEN
    RAISE EXCEPTION 'flag desligada: o gate deveria ser FALSE';
  END IF;
  v_ret := public.trigger_crm_sync_outbox();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'flag desligada: o trigger devolveu % (esperado 0)', v_ret;
  END IF;
  v_ret := public.run_crm_sync_outbox_cleanup();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'flag desligada: a limpeza devolveu % (esperado 0)', v_ret;
  END IF;
END
$prova$;

-- ---------- 3. sem segredo no vault: negado ----------
DO $prova$
DECLARE
  v_ret integer;
  v_antes bigint;
  v_depois bigint;
BEGIN
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'vault ausente neste banco: a prova do gate ficaria inconclusiva';
  END IF;
  DELETE FROM vault.secrets WHERE name IN ('crm_sync_outbox_url', 'crm_sync_outbox_cron_secret');
  UPDATE public.feature_flags SET enabled = true WHERE key = 'crm.integration';

  IF public.crm_sync_outbox_cron_enabled() IS NOT FALSE THEN
    RAISE EXCEPTION 'sem segredo no vault: o gate deveria ser FALSE';
  END IF;

  SELECT count(*) INTO v_antes FROM net.http_request_queue;
  v_ret := public.trigger_crm_sync_outbox();
  SELECT count(*) INTO v_depois FROM net.http_request_queue;

  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'sem segredo: o trigger devolveu % (esperado 0 = negado)', v_ret;
  END IF;
  IF v_depois <> v_antes THEN
    RAISE EXCEPTION 'sem segredo: % chamada(s) enfileirada(s) — deveria ser 0', v_depois - v_antes;
  END IF;
END
$prova$;

-- ---------- 4. flag ligada + segredo: 1 chamada para a Edge ----------
DO $prova$
DECLARE
  v_ret integer;
  v_antes bigint;
  v_depois bigint;
BEGIN
  PERFORM vault.create_secret('http://127.0.0.1:9/crm-integration-prova', 'crm_sync_outbox_url', 'prova local');
  PERFORM vault.create_secret('segredo-de-prova-local', 'crm_sync_outbox_cron_secret', 'prova local');

  IF public.crm_sync_outbox_cron_enabled() IS NOT TRUE THEN
    RAISE EXCEPTION 'flag ligada + segredo no vault: o gate deveria ser TRUE';
  END IF;

  SELECT count(*) INTO v_antes FROM net.http_request_queue;
  v_ret := public.trigger_crm_sync_outbox();
  SELECT count(*) INTO v_depois FROM net.http_request_queue;

  IF v_ret <> 1 THEN
    RAISE EXCEPTION 'o trigger nao disparou: devolveu % (esperado 1)', v_ret;
  END IF;
  IF v_depois <> v_antes + 1 THEN
    RAISE EXCEPTION 'esperava 1 chamada enfileirada, veio %', v_depois - v_antes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM net.http_request_queue
    WHERE url = 'http://127.0.0.1:9/crm-integration-prova'
      AND headers->>'x-cron-secret' = 'segredo-de-prova-local'
  ) THEN
    RAISE EXCEPTION 'a chamada enfileirada nao levou a URL e o x-cron-secret lidos do vault';
  END IF;
END
$prova$;

-- ---------- 5. drenagem: lote e max_attempts ----------
DO $prova$
DECLARE
  v_lote integer;
BEGIN
  -- As linhas paradas na fila sao 'failed' (o estado re-tentavel do outbox: o CHECK
  -- aceita pending/processing/succeeded/failed/dead_letter, NAO existe 'retry') e
  -- 'pending'. As duas precisam ser drenadas pelo mesmo claim.
  INSERT INTO public.crm_sync_outbox (idempotency_key, normalized_phone, payload, status, attempt_count, max_attempts, available_at)
  VALUES
    ('prova-cron-a-' || gen_random_uuid(), '5511900000001', '{}'::jsonb, 'failed', 1, 8, now() - interval '3 min'),
    ('prova-cron-b-' || gen_random_uuid(), '5511900000002', '{}'::jsonb, 'pending', 0, 8, now() - interval '2 min'),
    ('prova-cron-c-' || gen_random_uuid(), '5511900000003', '{}'::jsonb, 'failed', 1, 8, now() - interval '2 min'),
    ('prova-cron-max-' || gen_random_uuid(), '5511900000009', '{}'::jsonb, 'failed', 8, 8, now() - interval '2 min');

  SELECT count(*) INTO v_lote FROM public.claim_crm_sync_outbox('prova-cron:worker', 2);
  IF v_lote <> 2 THEN
    RAISE EXCEPTION 'lote: esperava 2 itens drenados, veio %', v_lote;
  END IF;

  -- as duas linhas mais antigas da fila sairam: uma 'failed' e uma 'pending'.
  IF NOT EXISTS (SELECT 1 FROM public.crm_sync_outbox
                  WHERE idempotency_key LIKE 'prova-cron-a-%' AND status = 'processing')
     OR NOT EXISTS (SELECT 1 FROM public.crm_sync_outbox
                  WHERE idempotency_key LIKE 'prova-cron-b-%' AND status = 'processing') THEN
    RAISE EXCEPTION 'o lote nao drenou as duas linhas mais antigas (failed + pending)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_sync_outbox
    WHERE idempotency_key LIKE 'prova-cron-max-%' AND status = 'failed' AND attempt_count = 8
  ) THEN
    RAISE EXCEPTION 'a linha ja no max_attempts foi drenada: o limite de tentativas nao foi respeitado';
  END IF;

  -- lease vencido de uma linha que ja gastou todas as tentativas: vai para dead_letter
  UPDATE public.crm_sync_outbox
     SET status = 'processing',
         locked_at = now() - interval '10 min',
         locked_by = 'prova-cron:worker',
         lease_token = gen_random_uuid()
   WHERE idempotency_key LIKE 'prova-cron-max-%';

  PERFORM public.claim_crm_sync_outbox('prova-cron:worker', 1);

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_sync_outbox
    WHERE idempotency_key LIKE 'prova-cron-max-%'
      AND status = 'dead_letter'
      AND last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS'
  ) THEN
    RAISE EXCEPTION 'lease vencido no max_attempts nao foi marcado dead_letter';
  END IF;
END
$prova$;

-- ---------- 6a. papeis reais: quem nao e service_role nao executa ----------
SET LOCAL ROLE authenticated;
DO $prova$
BEGIN
  BEGIN
    PERFORM public.trigger_crm_sync_outbox();
    RAISE EXCEPTION 'authenticated NAO deveria executar trigger_crm_sync_outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.run_crm_sync_outbox_cleanup();
    RAISE EXCEPTION 'authenticated NAO deveria executar run_crm_sync_outbox_cleanup';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cleanup_crm_sync_outbox();
    RAISE EXCEPTION 'authenticated NAO deveria executar cleanup_crm_sync_outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$prova$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $prova$
BEGIN
  BEGIN
    PERFORM public.trigger_crm_sync_outbox();
    RAISE EXCEPTION 'anon NAO deveria executar trigger_crm_sync_outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$prova$;
RESET ROLE;

-- ---------- 6b. limpeza diaria: so o que passou da retencao ----------
DO $prova$
DECLARE
  v_apagou integer;
BEGIN
  INSERT INTO public.crm_sync_outbox (
    idempotency_key, normalized_phone, payload, status, attempt_count, max_attempts,
    available_at, completed_at, external_interaction_id, external_contact_id
  )
  VALUES
    ('prova-cron-clean-old-' || gen_random_uuid(), '5511900000011', '{}'::jsonb, 'succeeded', 1, 8,
     now() - interval '300 days', now() - interval '200 days', 'ext-1', 'ext-co-1'),
    ('prova-cron-clean-new-' || gen_random_uuid(), '5511900000012', '{}'::jsonb, 'succeeded', 1, 8,
     now() - interval '1 day', now() - interval '1 hour', 'ext-2', 'ext-co-2');

  INSERT INTO public.crm_sync_outbox (idempotency_key, normalized_phone, payload, status, attempt_count, max_attempts, available_at, updated_at)
  VALUES ('prova-cron-clean-dl-' || gen_random_uuid(), '5511900000013', '{}'::jsonb, 'dead_letter', 8, 8,
          now() - interval '400 days', now() - interval '400 days');

  v_apagou := public.run_crm_sync_outbox_cleanup();
  IF v_apagou < 2 THEN
    RAISE EXCEPTION 'a limpeza apagou % linha(s), esperava pelo menos 2 (succeeded >90d e dead_letter >180d)', v_apagou;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.crm_sync_outbox
    WHERE idempotency_key LIKE 'prova-cron-clean-old-%' OR idempotency_key LIKE 'prova-cron-clean-dl-%'
  ) THEN
    RAISE EXCEPTION 'a limpeza nao apagou o que passou da retencao';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_sync_outbox WHERE idempotency_key LIKE 'prova-cron-clean-new-%'
  ) THEN
    RAISE EXCEPTION 'a limpeza apagou item DENTRO da retencao';
  END IF;
END
$prova$;

DO $prova$
BEGIN
  RAISE NOTICE 'crm_sync_outbox_cron: TODAS AS PROVAS PASSARAM (jobs agendados, gate, 1 chamada com x-cron-secret, lote/lease, ACL e retencao)';
END
$prova$;

ROLLBACK;

-- Nada foi gravado: o segredo de prova, a flag, as linhas da fila e a fila do pg_net
-- (que nunca chegou a ser enviada) saem com o ROLLBACK.
