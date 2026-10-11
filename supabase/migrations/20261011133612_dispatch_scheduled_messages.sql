-- dispatch_scheduled_messages
-- Rollback: desfaz o envio das agendadas — tira o job do pg_cron e dropa a função.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule('dispatch-scheduled-messages');
--   drop function if exists public.dispatch_scheduled_messages(integer);
--
-- Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md).
--
-- FATO: public.scheduled_messages tem índice de pendentes, RLS e hook de tela, mas NADA
-- a envia quando chega a hora — nenhuma Edge, nenhuma função SQL e nenhum job do pg_cron
-- toca a tabela. Mensagem agendada nunca sai.
--
-- O QUE ESTA MIGRATION FAZ
--   * public.dispatch_scheduled_messages(p_limit) SECURITY DEFINER: pega as PENDENTES
--     vencidas (scheduled_at <= now()) em lote pequeno, com FOR UPDATE SKIP LOCKED (duas
--     execuções concorrentes não pegam a mesma linha), e para cada uma chama o
--     enfileiramento canônico public.enqueue_outbound_message como o USUÁRIO DONO
--     (created_by -> profiles.user_id), respeitando a validação de contato e a permissão
--     send_messages do dono. client_message_id = id do agendamento (estável, idempotente).
--   * Isolamento por item: a falha de UMA agendada não cancela as outras (bloco
--     BEGIN/EXCEPTION por linha); o item falho vira 'failed' com motivo curto e é
--     auditado em audit_logs (sem telefone nem conteúdo).
--   * 'sent' só depois de enfileirar com sucesso; 'cancelled' nunca é processada.
--   * cron.schedule('dispatch-scheduled-messages', '* * * * *', ...) idempotente, no
--     padrão de 20260928140100_tasks_notify_due_cron.sql.
--
-- MIDIA: o agendamento guarda o localizador privado do bucket whatsapp-media
-- (https://.../storage/v1/object/public/whatsapp-media/<caminho>). O enfileiramento aceita
-- esse localizador (exige ^https://) e a Edge message-delivery o resolve em URL assinada
-- (resolvePrivateBucketUrl). Nenhuma mudança de Edge é necessária.
--
-- ACESSO: EXECUTE só para service_role (o job rodá como owner); REVOKE de PUBLIC/anon/
-- authenticated. Defesa em profundidade: o corpo recusa chamada com papel de JWT
-- authenticated/anon antes de qualquer trabalho.

CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages(p_limit integer DEFAULT 50)
RETURNS TABLE (
  scheduled_message_id uuid,
  outcome text,
  message_id uuid,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.scheduled_messages%ROWTYPE;
  v_owner_user_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_message_id uuid;
  v_reason text;
  v_claims text;
BEGIN
  -- A infraestrutura é a única chamadora (cron/service_role). O GRANT já barra o resto;
  -- esta guarda é defesa em profundidade contra um grant acidental a um papel de JWT.
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'permission denied for function dispatch_scheduled_messages'
      USING ERRCODE = '42501';
  END IF;

  -- Preserva o JWT de quem chamou para devolvê-lo ao fim (o laço troca o claim por item).
  v_claims := current_setting('request.jwt.claims', true);

  FOR v_row IN
    SELECT s.*
    FROM public.scheduled_messages AS s
    WHERE s.status = 'pending'
      AND s.scheduled_at <= now()
    ORDER BY s.scheduled_at, s.id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    scheduled_message_id := v_row.id;
    outcome := NULL;
    message_id := NULL;
    failure_reason := NULL;

    -- O remetente tem de existir e estar ativo: sem o dono não há como respeitar a
    -- permissão send_messages nem a visibilidade de contato dele.
    SELECT p.user_id INTO v_owner_user_id
    FROM public.profiles AS p
    WHERE p.id = v_row.created_by
      AND p.is_active = true
    LIMIT 1;

    IF v_owner_user_id IS NULL THEN
      outcome := 'failed';
      failure_reason := 'sender_unavailable';
    ELSE
      -- Enfileira como o dono: auth.uid()/auth.role() passam a ser dele dentro do laço.
      PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_owner_user_id::text, 'role', 'authenticated')::text,
        true
      );

      BEGIN
        SELECT enqueued.id INTO v_message_id
        FROM public.enqueue_outbound_message(
          p_contact_id             => v_row.contact_id,
          p_client_message_id      => v_row.id,
          p_content                => v_row.content,
          p_message_type           => coalesce(nullif(v_row.message_type, ''), 'text'),
          p_media_url              => v_row.media_url,
          p_reply_to_id            => NULL,
          p_whatsapp_connection_id => v_row.whatsapp_connection_id,
          p_caption                => NULL
        ) AS enqueued
        LIMIT 1;

        outcome := 'sent';
      EXCEPTION WHEN others THEN
        -- Motivo curto e estável (código + nome do erro), sem telefone nem conteúdo.
        v_message_id := NULL;
        outcome := 'failed';
        failure_reason := left(coalesce(sqlstate || ' ' || sqlerrm, 'unknown_error'), 200);
      END;
    END IF;

    IF outcome = 'sent' THEN
      UPDATE public.scheduled_messages
      SET status = 'sent',
          sent_at = now(),
          error_message = NULL,
          updated_at = now()
      WHERE id = v_row.id;
    ELSE
      UPDATE public.scheduled_messages
      SET status = 'failed',
          error_message = failure_reason,
          updated_at = now()
      WHERE id = v_row.id;

      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (
        v_owner_user_id,
        'scheduled_message_dispatch_failed',
        'scheduled_message',
        v_row.id,
        jsonb_build_object('reason', failure_reason)
      );
    END IF;

    RETURN NEXT;
  END LOOP;

  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_messages(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_messages(integer)
  TO service_role;

-- Job por minuto, idempotente (mesmo nome re-agenda em vez de duplicar).
SELECT cron.unschedule('dispatch-scheduled-messages')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-scheduled-messages'
);

SELECT cron.schedule(
  'dispatch-scheduled-messages',
  '* * * * *',
  'SELECT public.dispatch_scheduled_messages()'
);
