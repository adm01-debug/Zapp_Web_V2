CREATE OR REPLACE FUNCTION public.sweep_stuck_outbound_messages(p_min_age interval DEFAULT '00:10:00'::interval, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
$function$
