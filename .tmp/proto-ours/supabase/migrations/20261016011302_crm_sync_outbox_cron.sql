-- crm_sync_outbox_cron
-- Rollback: desagenda os dois jobs ('crm-sync-outbox' e 'crm-sync-outbox-cleanup', se pg_cron existir) e dropa as tres funcoes.
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname in ('crm-sync-outbox', 'crm-sync-outbox-cleanup'); end if; end $$;
--   drop function if exists public.trigger_crm_sync_outbox();
--   drop function if exists public.run_crm_sync_outbox_cleanup(integer, integer, integer);
--   drop function if exists public.crm_sync_outbox_cron_enabled();
--
-- HZ5-25: a fila public.crm_sync_outbox e alimentada (trigger em conversation_closures)
-- e drenada SO quando alguem chama a Edge crm-integration action=processOutbox, mas
-- NENHUM job pg_cron chamava essa acao: os itens aprovados ficavam parados para sempre.
-- E o mesmo furo ja corrigido no gmail (20260829110000_gmail_incremental_sync_cron.sql)
-- e no multiplix (20260929610000_multiplix_cron_window_and_limits.sql): a rotina existe,
-- falta o agendador.
--
-- So ADITIVO: nenhuma tabela, coluna, policy, GRANT de objeto existente ou dado e tocado.
-- Esta migration cria:
--   1. public.crm_sync_outbox_cron_enabled()  -> o gate. FALSE quando a flag
--      'crm.integration' esta desligada OU quando falta URL/segredo no vault.
--      Com FALSE, nenhum dos dois jobs faz nada (nem HTTP, nem DELETE).
--   2. public.trigger_crm_sync_outbox()       -> le URL e x-cron-secret do vault EM
--      RUNTIME (nunca hardcodados no arquivo, como no gmail) e faz net.http_post para a
--      Edge. A Edge drena com claim_crm_sync_outbox, que ja respeita lote (<=10), lease de
--      5 min e max_attempts (o que passar vai para dead_letter).
--   3. public.run_crm_sync_outbox_cleanup()   -> limpeza de retencao diaria
--      (cleanup_crm_sync_outbox: succeeded >90d, dead_letter >180d). Essa RPC exige
--      auth.role() = 'service_role'; o job roda como postgres (sem claim de JWT), entao a
--      funcao liga a claim SO nesta transacao antes de chamar.
--   4. dois jobs pg_cron: 'crm-sync-outbox' a cada 2 min e 'crm-sync-outbox-cleanup' 1x/dia.
--      A cadencia e '1-59/2' (30 disparos/hora, o mesmo de '*/2'), tirando o minuto 0 onde
--      ja coincidem 9 jobs contra max_worker_processes=6 (ver 20261002511230).
--
-- SEGREDOS: criados MANUALMENTE no vault antes de valer em producao, como o gmail_cron_secret:
--   crm_sync_outbox_url          -> URL da Edge, ex.: https://<ref>.supabase.co/functions/v1/crm-integration
--   crm_sync_outbox_cron_secret  -> MESMO valor do env CRON_SECRET da Edge crm-integration
-- Enquanto eles nao existirem, crm_sync_outbox_cron_enabled() e FALSE e os jobs sao inocuos.

CREATE OR REPLACE FUNCTION public.crm_sync_outbox_cron_enabled()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_flag boolean;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags WHERE key = 'crm.integration';
  IF v_flag IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- Sem vault (ou sem os dois segredos) nao ha como chamar a Edge: nao agenda nada util.
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'crm_sync_outbox_url')
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'crm_sync_outbox_cron_secret');
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_crm_sync_outbox()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF NOT public.crm_sync_outbox_cron_enabled() THEN
    RETURN 0;  -- kill switch desligado ou sem credencial: job inócuo, nada sai daqui
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'crm_sync_outbox_url' LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'crm_sync_outbox_cron_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'processOutbox'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    timeout_milliseconds := 30000
  );
  RETURN 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_crm_sync_outbox_cleanup(
  p_succeeded_days integer DEFAULT 90,
  p_dead_letter_days integer DEFAULT 180,
  p_limit integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.crm_sync_outbox_cron_enabled() THEN
    RETURN 0;  -- kill switch desligado: nada e apagado
  END IF;

  -- cleanup_crm_sync_outbox() exige auth.role() = 'service_role'. O job roda como
  -- postgres, sem claim de JWT, entao ligamos a claim SO nesta transacao (is_local = true).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  RETURN public.cleanup_crm_sync_outbox(p_succeeded_days, p_dead_letter_days, p_limit);
END;
$function$;

-- Rotinas de manutencao chamadas pelo job: EXECUTE negado a PUBLIC, anon e authenticated.
REVOKE ALL ON FUNCTION public.crm_sync_outbox_cron_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_crm_sync_outbox() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_crm_sync_outbox_cleanup(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_crm_sync_outbox() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_crm_sync_outbox_cleanup(integer, integer, integer) TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-sync-outbox') THEN
      PERFORM cron.unschedule('crm-sync-outbox');
    END IF;
    PERFORM cron.schedule(
      'crm-sync-outbox',
      '1-59/2 * * * *',
      'select public.trigger_crm_sync_outbox()'
    );

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-sync-outbox-cleanup') THEN
      PERFORM cron.unschedule('crm-sync-outbox-cleanup');
    END IF;
    PERFORM cron.schedule(
      'crm-sync-outbox-cleanup',
      '17 4 * * *',
      'select public.run_crm_sync_outbox_cleanup()'
    );
  END IF;
END
$do$;
