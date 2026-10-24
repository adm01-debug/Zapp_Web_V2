-- talkx_engine_tick
-- versão 20261001391230 reservada para hermes-engine-tick-2610020034e126 em 2026-10-02T00:35:08-03:00 (hermes-db-migrar --nova)
-- rollback: 1) DROP FUNCTION public.trigger_talkx_engine_tick(); DROP FUNCTION public.kick_talkx_campaign(uuid); DROP FUNCTION public.sweep_talkx_stuck_recipients(integer); DROP FUNCTION public.get_talkx_send_url();
--   2) RESTAURAR o command anterior do job existente (o de 20260909000000_talkx_scheduler_cron.sql), sem recriar o job:
--      SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'talkx-scheduler-1min'), command := $cmd$
--        SELECT net.http_post(
--          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url'),
--          headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key'), 'Content-Type', 'application/json'),
--          body := '{}'::jsonb
--        ) AS request_id
--      $cmd$);
--   3) DELETE FROM vault.secrets WHERE name = 'talkx_send_url';
--   4) nada mais é criado no schema: não há coluna, índice, tipo ou trigger novos. O segredo talkx_cron_secret é da X010 e permanece.
--
-- X012 (Fase 2 · Tela motor · banco + cron). Fecha CAP-006, CAP-007, CAP-009,
-- CAP-011, CAP-037 e CAP-098. Exige X010 e X011 já mergeadas.
--
-- HOJE (antes desta migration):
--   * destinatário 'sending' com provider_dispatch_started_at preenchido e lease
--     vencido (edge morreu no meio do POST) é EXCLUÍDO do claim de propósito
--     (M:20260912110000, candidate exige provider_dispatch_started_at IS NULL) e
--     ninguém o recicla — fica 'sending' para sempre;
--   * campanha 'sending' não é re-invocada: o talkx-scheduler só trata 'scheduled'
--     e 'paused';
--   * a conclusão (complete_talkx_campaign_if_drained) só é tentada pela própria
--     invocação da edge — se a invocação morre, a campanha nunca fecha;
--   * o cron chama net.http_post sem timeout_milliseconds e só com a anon key.
--
-- FAZER (esta migration):
--   (a) sweep_talkx_stuck_recipients(p_limit) — item preso (lease vencido DEPOIS do
--       POST) vira 'outcome_unknown' e soma em outcome_unknown_count. Mesmo corpo de
--       sweep_multiplix_stuck_recipients (M:20260929600000:239-290), adaptado para
--       talkx_recipients/talkx_campaigns;
--   (b) kick_talkx_campaign(p_campaign_id) — 1 net.http_post para talkx-send com
--       body {campaignId, action:'continue'}, Bearer da anon key (verify_jwt=true),
--       header x-cron-secret (get_talkx_cron_secret) e timeout_milliseconds := 30000;
--   (c) trigger_talkx_engine_tick() — declara o papel de serviço localmente (padrão
--       M:20260929610000:171), roda o sweep, conclui cada campanha 'sending' sem fila,
--       dá kick em no MÁXIMO 1 campanha 'sending' por whatsapp_connection_id (a de
--       updated_at mais antigo; teto de 10 no tick) e faz 1 POST para talkx-scheduler
--       com o mesmo segredo e timeout;
--   (d) troca do command do job EXISTENTE 'talkx-scheduler-1min' por
--       SELECT public.trigger_talkx_engine_tick() via cron.alter_job — SEM criar job
--       novo (o pg_cron já falhava com 'job startup timeout'; mais um job só aumenta a
--       disputa por worker);
--   (e) segredo talkx_send_url no Vault (criado se não existir).
-- Todas as funções novas são só para service_role.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + ACL + alter job idempotente).
-- Nenhum DROP de nome vivo: as 4 funções são novas.

-- (e) segredo talkx_send_url no Vault -----------------------------------------
-- Mesmo padrão de 20260929610000: gera o segredo dentro do banco, só se não existir.
-- Tolerante à ausência do Vault em PostgreSQL descartável (DO + to_regclass).
DO $$
BEGIN
  IF to_regclass('vault.secrets') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'talkx_send_url') THEN
      PERFORM vault.create_secret(
        'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/talkx-send',
        'talkx_send_url'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'talkx_engine_tick_vault_seed_skipped: %', SQLERRM;
END;
$$;

-- (a) reaper: item preso após o POST vira outcome_unknown ---------------------
CREATE OR REPLACE FUNCTION public.sweep_talkx_stuck_recipients(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_swept integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_talkx_sweep_limit' USING ERRCODE = '22023';
  END IF;

  WITH stuck AS (
    SELECT recipient.id, recipient.campaign_id
      FROM public.talkx_recipients AS recipient
     WHERE recipient.status = 'sending'
       AND recipient.delivery_claim_expires_at < statement_timestamp()
       AND recipient.provider_dispatch_started_at IS NOT NULL
     ORDER BY recipient.delivery_claim_expires_at
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  ), swept AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE recipient.id = stuck.id
    RETURNING recipient.campaign_id
  ), counted AS (
    SELECT swept.campaign_id, count(*) AS n FROM swept GROUP BY swept.campaign_id
  ), bumped AS (
    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = campaign.outcome_unknown_count + counted.n,
           updated_at = statement_timestamp()
      FROM counted
     WHERE campaign.id = counted.campaign_id
    RETURNING campaign.id
  )
  SELECT COALESCE(sum(counted.n), 0) INTO v_swept FROM counted;

  RETURN v_swept;
END;
$function$;

-- getter do segredo da edge talkx-send (service_role) -------------------------
-- SECURITY DEFINER + EXECUTE só para service_role é o que deixa a função ler o
-- Vault sem expor vault.decrypted_secrets a anon/authenticated.
CREATE OR REPLACE FUNCTION public.get_talkx_send_url()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'talkx_send_url'
  LIMIT 1
$function$;

-- (b) kick: re-invoca a edge talkx-send para continuar a fila -----------------
-- Chamada pelo tick (X012) e pelo lançamento assíncrono (X013). Um único POST:
-- o lote roda em OUTRA invocação da edge, via action='continue'.
CREATE OR REPLACE FUNCTION public.kick_talkx_campaign(p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_status      text;
  v_send_url    text;
  v_anon_key    text;
  v_cron_secret text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  -- Só campanha em envio é re-invocada; a leitura confirma também que existe.
  SELECT campaign.status
    INTO v_status
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id;
  IF NOT FOUND OR v_status <> 'sending' THEN
    RETURN;
  END IF;

  v_send_url := public.get_talkx_send_url();
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key' LIMIT 1;
  v_cron_secret := public.get_talkx_cron_secret();

  IF v_send_url IS NULL OR v_anon_key IS NULL OR v_cron_secret IS NULL THEN
    RETURN; -- sem rota/credencial configuradas não há como re-invocar a edge
  END IF;

  PERFORM net.http_post(
    url := v_send_url,
    body := jsonb_build_object('campaignId', p_campaign_id::text, 'action', 'continue'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-cron-secret', v_cron_secret
    ),
    timeout_milliseconds := 30000
  );
END;
$function$;

-- (c) tick do motor -----------------------------------------------------------
-- Um tick perdido só atrasa 1 min: nenhuma decisão depende de uma execução
-- isolada. pg_cron roda como postgres (dono, sem claim de JWT), por isso o papel
-- é declarado localmente com is_local=true (vale só para a transação do tick).
CREATE OR REPLACE FUNCTION public.trigger_talkx_engine_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_campaign_id      uuid;
  v_scheduler_url    text;
  v_anon_key         text;
  v_cron_secret      text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

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

-- ACL: as 4 funções novas são só para service_role ---------------------------
REVOKE ALL ON FUNCTION public.sweep_talkx_stuck_recipients(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_talkx_send_url()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kick_talkx_campaign(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_talkx_engine_tick()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sweep_talkx_stuck_recipients(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_talkx_send_url()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.kick_talkx_campaign(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_talkx_engine_tick()
  TO service_role;

-- (d) troca do command do job existente — sem criar job novo ------------------
-- Idempotente: se o job não existir (ou o pg_cron não estiver instalado, como no
-- PostgreSQL descartável), não faz nada e não quebra a migration.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT jobid INTO v_job_id
      FROM cron.job WHERE jobname = 'talkx-scheduler-1min' LIMIT 1;
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.alter_job(
        job_id  := v_job_id,
        command := 'SELECT public.trigger_talkx_engine_tick()'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'talkx_engine_tick_cron_alter_skipped: %', SQLERRM;
END;
$$;

-- Fail-closed: se qualquer função sumir (ex.: um CREATE OR REPLACE que não colou),
-- a migration aborta em vez de deixar o contrato pela metade.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.sweep_talkx_stuck_recipients(integer)'),
      ('public.get_talkx_send_url()'),
      ('public.kick_talkx_campaign(uuid)'),
      ('public.trigger_talkx_engine_tick()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_engine_tick_rpcs_ausentes: %', v_missing;
  END IF;
END;
$$;
