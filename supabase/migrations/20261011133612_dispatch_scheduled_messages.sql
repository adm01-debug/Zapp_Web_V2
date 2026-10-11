-- dispatch_scheduled_messages
-- Rollback: remove o que esta migration cria — tira o job do pg_cron, dropa a função
-- e remove a coluna message_id (fora desta migration ela não existe).
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule('dispatch-scheduled-messages');
--   drop function if exists public.dispatch_scheduled_messages(integer);
--   alter table public.scheduled_messages drop column if exists message_id;
-- Mensagens já enfileiradas em messages permanecem (efeito externo, como qualquer envio).
--
-- Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md).
--
-- FATO: public.scheduled_messages tem índice de pendentes, RLS e hook de tela, mas NADA
-- a envia quando chega a hora — nenhuma Edge, nenhuma função SQL e nenhum job do pg_cron
-- toca a tabela. Mensagem agendada nunca sai.
--
-- O QUE ESTA MIGRATION FAZ
--   * ALTER TABLE aditivo: message_id uuid (nulo; preenchido com o id da mensagem
--     enfileirada quando o despacho conclui; sem FK para não travar o envio).
--   * public.dispatch_scheduled_messages(p_limit) SECURITY DEFINER: pega as PENDENTES
--     vencidas (scheduled_at <= now()) em lote pequeno, com FOR UPDATE SKIP LOCKED (duas
--     execuções concorrentes não pegam a mesma linha), e para cada uma chama o
--     enfileiramento canônico public.enqueue_outbound_message como o USUÁRIO DONO
--     (created_by -> profiles.user_id). client_message_id = id do agendamento (uuid
--     estável; a UNIQUE (contact_id, client_message_id) + advisory lock do enqueue
--     tornam a reexecução idempotente — 'sched:'||id não cabe na coluna uuid).
--   * Atraso tolerado (decisão do dono 11/10): atraso de até 15 min envia normal;
--     acima disso NÃO envia: status 'expired' + error_message
--     'expirada: atraso acima de 15 min' (sem CHECK novo: status é texto livre).
--   * Reautorização no envio com a identidade do autor, motivos curtos e estáveis:
--     autor_inativo, sem_permissao, contato_invalido, contato_bloqueado
--     (contacts.conversation_status = 'archived'; não há flag de bloqueio em contacts),
--     conexao_invalida. Erro residual do enqueue é mapeado para o mesmo vocabulário
--     (fallback 'enqueue_failed').
--   * Assinatura (decisão do dono 11/10, mesma regra de useMessageSignature):
--     `*PrimeiroNome - Cargo:*` (só `*PrimeiroNome:*` sem cargo) de
--     profiles.name/job_title prefixado ao conteúdo; sem nome, não assina.
--     Não há interruptor por usuário no servidor (o toggle do hook é localStorage).
--   * Isolamento por item: a falha de UMA agendada não cancela as outras (bloco
--     BEGIN/EXCEPTION por linha). 'sent' só com message_id preenchido; retorno sem
--     linha do enqueue vira 'failed' ('enqueue_returned_no_row'); 'cancelled' e
--     'expired' nunca são processadas. Falha é auditada em audit_logs (só o motivo,
--     sem telefone nem conteúdo).
--   * cron.schedule('dispatch-scheduled-messages', '* * * * *', ...) idempotente, no
--     padrão de 20260928140100_tasks_notify_due_cron.sql.
--
-- MIDIA: o agendamento guarda o localizador privado do bucket whatsapp-media
-- (https://.../storage/v1/object/public/whatsapp-media/<caminho>). O enfileiramento aceita
-- esse localizador (exige ^https://) e a Edge message-delivery o resolve em URL assinada
-- (resolvePrivateBucketUrl). Nenhuma mudança de Edge é necessária.
--
-- ACESSO: EXECUTE só para service_role (o job roda como owner); REVOKE de PUBLIC/anon/
-- authenticated. Defesa em profundidade: o corpo recusa chamada com papel de JWT
-- authenticated/anon antes de qualquer trabalho.
--
-- SEM LIMITE DE ANTECEDÊNCIA (decisão do dono 11/10): nenhum CHECK de prazo máximo;
-- scheduled_at é timestamptz (UTC), sem conversão no banco.

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS message_id uuid;

COMMENT ON COLUMN public.scheduled_messages.message_id IS
  'Id da mensagem enfileirada pelo despacho (dispatch_scheduled_messages); nulo até o envio concluir.';

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
  v_owner_name text;
  v_owner_job text;
  v_contact public.contacts%ROWTYPE;
  v_conn_live boolean;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_message_id uuid;
  v_reason text;
  v_claims text;
  v_signed_content text;
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
    v_message_id := NULL;
    v_reason := NULL;

    -- Atraso tolerado: até 15 min envia normal; acima disso expira sem enviar.
    IF now() - v_row.scheduled_at > interval '15 minutes' THEN
      UPDATE public.scheduled_messages
      SET status = 'expired',
          error_message = 'expirada: atraso acima de 15 min',
          updated_at = now()
      WHERE id = v_row.id;
      outcome := 'expired';
      failure_reason := 'expirada: atraso acima de 15 min';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- O remetente tem de existir e estar ativo: sem o dono não há como respeitar a
    -- permissão send_messages nem a visibilidade de contato dele.
    SELECT p.user_id, p.name, p.job_title
      INTO v_owner_user_id, v_owner_name, v_owner_job
    FROM public.profiles AS p
    WHERE p.id = v_row.created_by
      AND p.is_active = true
    LIMIT 1;

    IF v_owner_user_id IS NULL THEN
      outcome := 'failed';
      failure_reason := 'autor_inativo';
    ELSE
      -- Enfileira como o dono: auth.uid()/auth.role() passam a ser dele dentro do laço,
      -- para as checagens abaixo e o enqueue usarem a identidade do autor.
      PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_owner_user_id::text, 'role', 'authenticated')::text,
        true
      );

      -- Reautorização no momento do envio, com vocabulário curto e estável.
      IF public.user_has_permission(v_owner_user_id, 'send_messages') IS NOT TRUE THEN
        v_reason := 'sem_permissao';
      ELSE
        SELECT c.* INTO v_contact
        FROM public.contacts AS c
        WHERE c.id = v_row.contact_id
        LIMIT 1;

        IF NOT FOUND OR v_contact.deleted_at IS NOT NULL THEN
          v_reason := 'contato_invalido';
        ELSIF v_contact.conversation_status = 'archived' THEN
          v_reason := 'contato_bloqueado';
        ELSIF public.is_contact_visible_to_user(v_row.contact_id, v_owner_user_id) IS NOT TRUE THEN
          v_reason := 'contato_invalido';
        ELSIF v_row.whatsapp_connection_id IS NOT NULL THEN
          SELECT EXISTS (
            SELECT 1 FROM public.whatsapp_connections AS w
            WHERE w.id = v_row.whatsapp_connection_id
              AND w.status = 'connected'
              AND NULLIF(w.instance_id, '') IS NOT NULL
          ) INTO v_conn_live;
          IF v_conn_live IS NOT TRUE THEN
            v_reason := 'conexao_invalida';
          END IF;
        END IF;
      END IF;

      IF v_reason IS NOT NULL THEN
        outcome := 'failed';
        failure_reason := v_reason;
      ELSE
        -- Assinatura do atendente no momento do envio (regra de useMessageSignature).
        v_signed_content := v_row.content;
        IF v_owner_name IS NOT NULL AND v_owner_name <> '' THEN
          v_signed_content := '*' || split_part(v_owner_name, ' ', 1)
            || CASE WHEN v_owner_job IS NOT NULL AND v_owner_job <> ''
                    THEN ' - ' || v_owner_job ELSE '' END
            || ':*' || chr(10) || v_row.content;
        END IF;

        BEGIN
          SELECT enqueued.id INTO v_message_id
          FROM public.enqueue_outbound_message(
            p_contact_id             => v_row.contact_id,
            p_client_message_id      => v_row.id,
            p_content                => v_signed_content,
            p_message_type           => coalesce(nullif(v_row.message_type, ''), 'text'),
            p_media_url              => v_row.media_url,
            p_reply_to_id            => NULL,
            p_whatsapp_connection_id => v_row.whatsapp_connection_id,
            p_caption                => NULL
          ) AS enqueued
          LIMIT 1;

          IF v_message_id IS NULL THEN
            outcome := 'failed';
            failure_reason := 'enqueue_returned_no_row';
          ELSE
            message_id := v_message_id;
            outcome := 'sent';
          END IF;
        EXCEPTION WHEN others THEN
          -- Motivo curto e estável (sem telefone nem conteúdo); preserva o
          -- vocabulário da reautorização quando o enqueue barra pelo mesmo motivo.
          v_message_id := NULL;
          message_id := NULL;
          outcome := 'failed';
          failure_reason := CASE
            WHEN sqlerrm LIKE '%send_messages_permission_required%' THEN 'sem_permissao'
            WHEN sqlerrm LIKE '%active_profile_not_found%' THEN 'autor_inativo'
            WHEN sqlerrm LIKE '%message_contact_not_authorized%' THEN 'contato_invalido'
            WHEN sqlerrm LIKE '%no_connected_whatsapp_connection%'
              OR sqlerrm LIKE '%selected_whatsapp_connection_unavailable%'
              OR sqlerrm LIKE '%whatsapp_connection_out_of_scope%' THEN 'conexao_invalida'
            ELSE 'enqueue_failed'
          END;
        END;
      END IF;
    END IF;

    IF outcome = 'sent' THEN
      UPDATE public.scheduled_messages
      SET status = 'sent',
          message_id = v_message_id,
          sent_at = now(),
          error_message = NULL,
          updated_at = now()
      WHERE id = v_row.id;
    ELSIF outcome = 'expired' THEN
      -- Já gravado acima (status + error_message); sem auditoria: não é falha de envio.
      NULL;
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
