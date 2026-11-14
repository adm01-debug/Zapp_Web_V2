-- agendadas_conexao_do_contato_caida
-- Revisão da PR #3037 (auditoria Conversas 2026-11-13).
--
-- Rollback (SQL executável, na ordem):
--   Recriar public.dispatch_scheduled_messages(integer) com o bloco
--   "CREATE OR REPLACE FUNCTION ... TO service_role;" de
--   20261011133612_dispatch_scheduled_messages.sql (sem alteração).
--
-- O QUE MUDA
--   20261113130000 fez os enqueue_* recusarem com 'contact_whatsapp_connection_disconnected'
--   quando a conexão do contato caiu (antes caíam em outra conexão). A agendada que
--   bater nisso tem de virar 'conexao_invalida' (o mesmo motivo de conexão fora do ar),
--   e não o genérico 'enqueue_failed'. Corpo IDÊNTICO ao vigente (20261011133612, única
--   definição no histórico): só a linha nova no CASE do motivo. Assinatura, ACL e o job
--   pg_cron não mudam (o job não é reagendado aqui).
--
-- PRÉ-CONDIÇÃO: a função existe. PÓS: o CASE reconhece o código novo.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('public.dispatch_scheduled_messages(integer)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: dispatch_scheduled_messages(integer) ausente (aplique 20261011133612 antes)';
  END IF;
END
$pre$;

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
          message_id = NULL,
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
              OR sqlerrm LIKE '%contact_whatsapp_connection_disconnected%'
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
          message_id = NULL,
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

DO $post$
BEGIN
  IF position('contact_whatsapp_connection_disconnected' IN pg_get_functiondef('public.dispatch_scheduled_messages(integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: dispatch_scheduled_messages nao mapeia contact_whatsapp_connection_disconnected';
  END IF;
  IF has_function_privilege('authenticated', 'public.dispatch_scheduled_messages(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: authenticated nao pode executar dispatch_scheduled_messages';
  END IF;
END
$post$;

COMMIT;
