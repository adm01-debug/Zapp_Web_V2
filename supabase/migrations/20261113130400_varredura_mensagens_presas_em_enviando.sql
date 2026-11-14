-- varredura_mensagens_presas_em_enviando
-- Auditoria Conversas 2026-11-13, P1-1.
--
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where jobname = 'outbound-sending-sweeper';
--   drop function if exists public.sweep_stuck_outbound_messages(interval, integer);
--   delete from public.global_settings where key = 'outbound_sweeper_marker_epoch';
--
-- O QUE ESTAVA ERRADO
--   157 mensagens em 'sending' há dias/semanas (28/09 a 01/11). A entrega só é
--   disparada pelo navegador de quem enviou (message-delivery); se a aba fecha, a
--   Edge morre ou o lease vence, nada mais olha para a linha: o relógio da bolha fica
--   eterno e o atendente não sabe se reenvia.
--
-- O QUE MUDA
--   public.sweep_stuck_outbound_messages(idade_minima, limite), rodada a cada minuto
--   pelo pg_cron, olha mensagens de agente em 'sending', sem recibo (external_id
--   NULL), sem resolução manual, paradas há mais de 10 min e sem lease vivo. Segue a
--   semântica da message-delivery / PD-79 — NUNCA reenvia sozinha:
--     a) conexão = fixture de teste (instance_id 'E2E_FIXTURE'): nenhum cliente real
--        foi alcançado -> 'failed' (motivo conexao_de_teste);
--     b) POST ao provedor já iniciado (delivery_post_started_at): resultado
--        AMBÍGUO -> fica como está, para o painel de resolução manual
--        (resolve_unconfirmed_message, admin/supervisor);
--     c) nunca reivindicada (delivery_attempt_count = 0): o POST não pode ter saído
--        -> 'failed' (motivo nunca_despachada); o atendente vê "Falha no envio" e
--        pode reenviar com segurança;
--     d) reivindicada PELA EDGE message-delivery (delivery_claimed_by =
--        'edge:message-delivery'), sem carimbo de POST, e o claim é POSTERIOR ao
--        marcador desta migration (essa Edge carimba ANTES do POST): o POST não saiu
--        -> 'failed' (motivo lease_vencido_sem_post). Claims de OUTROS workers
--        (mensagem de ausência, chatbot L1...) não entram aqui: vão para (e);
--     e) reivindicada, sem carimbo, claim ANTERIOR ao marcador (época em que a Edge
--        ainda não carimbava): não dá para saber se o POST saiu -> é tratada como
--        ambígua: recebe delivery_post_started_at = instante do claim e entra no
--        painel de resolução manual. Conservador: nunca vira 'failed' às cegas.
--        Os QUATRO campos do claim são zerados juntos (CHECK messages_delivery_claim_state)
--        e o token vai para delivery_last_claim_token.
--   Cada linha é tratada num bloco próprio: erro numa linha vira WARNING e a varredura
--   segue com as demais (uma linha ruim não trava o job de minuto em minuto).
--   Mensagens criadas por agendamento (scheduled_messages.message_id) NÃO entram: o
--   servidor as enfileira mas ainda não chama a entrega (TODO na PR #3037).
--   Cada decisão grava uma linha em message_attempts (log_message_attempt), que até
--   aqui ninguém preenchia.
--
-- Marcador: global_settings.outbound_sweeper_marker_epoch = instante do apply.
-- PRÉ-CONDIÇÃO: 20261111160000 (delivery_post_started_at/manually_resolved_at) e
-- 20261011124430 (message_attempts) aplicadas.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'messages'
                    AND column_name = 'delivery_post_started_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'messages'
                    AND column_name = 'manually_resolved_at')
     OR to_regprocedure('public.log_message_attempt(uuid, integer, text, text, text, integer, jsonb, integer)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scheduled_messages'
                    AND column_name = 'message_id') THEN
    RAISE EXCEPTION 'pre-condicao: aplique 20261011124430 e 20261111160000 antes';
  END IF;
END
$pre$;

INSERT INTO public.global_settings (key, value, description)
SELECT 'outbound_sweeper_marker_epoch', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'P1-1: claims anteriores a este instante sem carimbo de POST são ambíguos (varredura de sending).'
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings WHERE key = 'outbound_sweeper_marker_epoch');

CREATE OR REPLACE FUNCTION public.sweep_stuck_outbound_messages(
  p_min_age interval DEFAULT interval '10 minutes',
  p_limit   integer  DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_marker   timestamptz;
  v_row      record;
  v_reason   text;
  v_failed   integer := 0;
  v_legacy   integer := 0;
  v_ambig    integer := 0;
  v_errors   integer := 0;
BEGIN
  IF p_min_age IS NULL OR p_min_age < interval '2 minutes'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid_sweep_arguments' USING ERRCODE = '22023';
  END IF;

  SELECT NULLIF(value, '')::timestamptz INTO v_marker
    FROM public.global_settings WHERE key = 'outbound_sweeper_marker_epoch';
  -- Sem marcador: todo claim sem carimbo é tratado como ambíguo (o mais seguro).
  v_marker := COALESCE(v_marker, 'infinity'::timestamptz);

  FOR v_row IN
    SELECT m.id, m.delivery_attempt_count, m.delivery_claimed_at, m.delivery_claimed_by,
           m.delivery_post_started_at, m.status_updated_at, m.created_at,
           c.instance_id
      FROM public.messages AS m
      LEFT JOIN public.whatsapp_connections AS c ON c.id = m.whatsapp_connection_id
     WHERE m.status = 'sending'
       AND m.sender = 'agent'
       AND m.external_id IS NULL
       AND m.manually_resolved_at IS NULL
       AND COALESCE(m.status_updated_at, m.created_at) < statement_timestamp() - p_min_age
       AND (m.delivery_claim_token IS NULL OR m.delivery_claim_expires_at <= statement_timestamp())
       -- (b) ambíguas já carimbadas ficam para o painel manual; só as da fixture saem.
       AND (m.delivery_post_started_at IS NULL OR c.instance_id = 'E2E_FIXTURE')
       -- Agendadas (scheduled_messages.message_id) ficam FORA: hoje o servidor enfileira
       -- mas não chama a entrega; marcá-las 'failed' aos 10 min seria errado.
       -- TODO (cartão na PR #3037): ligar o dispatch de agendadas à message-delivery.
       AND NOT EXISTS (SELECT 1 FROM public.scheduled_messages AS s WHERE s.message_id = m.id)
     ORDER BY COALESCE(m.status_updated_at, m.created_at)
     LIMIT p_limit
     FOR UPDATE OF m SKIP LOCKED
  LOOP
    BEGIN
      v_reason := CASE
        WHEN v_row.instance_id = 'E2E_FIXTURE' THEN 'conexao_de_teste'
        WHEN COALESCE(v_row.delivery_attempt_count, 0) = 0 THEN 'nunca_despachada'
        WHEN v_row.delivery_claimed_by = 'edge:message-delivery'
             AND v_row.delivery_claimed_at IS NOT NULL
             AND v_row.delivery_claimed_at >= v_marker THEN 'lease_vencido_sem_post'
        ELSE NULL
      END;

      IF v_reason IS NULL THEN
        -- (e) não dá para provar que o POST não saiu: vai para a resolução manual.
        UPDATE public.messages
           SET delivery_post_started_at = COALESCE(v_row.delivery_claimed_at, v_row.status_updated_at, v_row.created_at),
               delivery_last_claim_token = COALESCE(delivery_claim_token, delivery_last_claim_token),
               delivery_claim_token = NULL, delivery_claimed_at = NULL,
               delivery_claim_expires_at = NULL, delivery_claimed_by = NULL,
               updated_at = statement_timestamp()
         WHERE id = v_row.id;
        PERFORM public.log_message_attempt(
          v_row.id, GREATEST(COALESCE(v_row.delivery_attempt_count, 0), 1), 'failed_retryable',
          'ambiguo_sem_carimbo', 'Envio sem confirmação de saída: aguardando resolução manual.',
          NULL, NULL, NULL);
        v_legacy := v_legacy + 1;
      ELSE
        UPDATE public.messages
           SET status = 'failed',
               status_updated_at = statement_timestamp(),
               delivery_last_claim_token = COALESCE(delivery_claim_token, delivery_last_claim_token),
               delivery_claim_token = NULL, delivery_claimed_at = NULL,
               delivery_claim_expires_at = NULL, delivery_claimed_by = NULL,
               updated_at = statement_timestamp()
         WHERE id = v_row.id;
        PERFORM public.log_message_attempt(
          v_row.id, GREATEST(COALESCE(v_row.delivery_attempt_count, 0), 1), 'failed_final',
          v_reason,
          CASE v_reason
            WHEN 'conexao_de_teste' THEN 'Mensagem gravada na conexão de teste (E2E); nunca saiu para o cliente.'
            WHEN 'nunca_despachada' THEN 'A entrega nunca foi iniciada; nada saiu para o WhatsApp.'
            ELSE 'O envio parou antes de sair para o WhatsApp.'
          END,
          NULL, NULL, NULL);
        v_failed := v_failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Uma linha ruim não derruba a varredura inteira (o bloco desfaz só esta linha).
      RAISE WARNING 'sweep_stuck_outbound_messages: mensagem % ignorada (%: %)', v_row.id, SQLSTATE, SQLERRM;
      v_errors := v_errors + 1;
    END;
  END LOOP;

  SELECT count(*) INTO v_ambig
    FROM public.messages AS m
   WHERE m.status = 'sending' AND m.sender = 'agent' AND m.external_id IS NULL
     AND m.manually_resolved_at IS NULL AND m.delivery_post_started_at IS NOT NULL
     AND COALESCE(m.status_updated_at, m.created_at) < statement_timestamp() - p_min_age;

  RETURN jsonb_build_object(
    'failed', v_failed,
    'moved_to_manual', v_legacy,
    'awaiting_manual', v_ambig,
    'errors', v_errors
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_stuck_outbound_messages(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stuck_outbound_messages(interval, integer) TO service_role;

COMMENT ON FUNCTION public.sweep_stuck_outbound_messages(interval, integer) IS
  'P1-1 (2026-11-13): varre mensagens de agente presas em sending. Nunca reenvia: falha o que comprovadamente não saiu, manda para resolução manual o que é ambíguo, grava message_attempts.';

-- pg_cron (mesmo padrão dos jobs do projeto). Banco sem pg_cron (descartável) só pula.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'outbound-sending-sweeper';
    PERFORM cron.schedule(
      'outbound-sending-sweeper',
      '* * * * *',
      $job$SELECT public.sweep_stuck_outbound_messages()$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron ausente: job outbound-sending-sweeper nao agendado';
  END IF;
END
$cron$;

DO $post$
BEGIN
  IF has_function_privilege('authenticated', 'public.sweep_stuck_outbound_messages(interval, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: authenticated nao pode executar a varredura';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE key = 'outbound_sweeper_marker_epoch') THEN
    RAISE EXCEPTION 'pos-condicao: marcador ausente';
  END IF;
END
$post$;

COMMIT;
