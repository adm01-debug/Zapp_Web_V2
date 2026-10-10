-- f59_transition_dispatch_enum_cast
-- versão 20261002521230 reservada para hermes-bloco-f-finalizacao-2610021025c321 em 2026-10-02T12:06:50-03:00 (hermes-db-migrar --nova)
-- Classe: CONTRATO (create or replace function).
--
-- rollback: DROP FUNCTION IF EXISTS public.transition_multiplix_dispatch(uuid, text, text); e recriar a versao de 20260929600000_multiplix_send_engine_fixes.sql (a que faz SET status = v_next_status sem cast).
-- rollback: ATENCAO — o rollback reintroduz a falha 42804 descrita abaixo. Use so se esta migration precisar ser desfeita.
--
-- ACHADO CRITICO (nao previsto no plano, encontrado ao escrever o teste F57):
--
-- A 20261001201230_f30 converteu multiplix_dispatches.status de text para o enum
-- public.multiplix_dispatch_status. Nenhuma migration posterior recriou
-- transition_multiplix_dispatch — a ultima versao (20260929600000, linhas 224) escreve
--   SET status = v_next_status,
-- com v_next_status declarado como text. Como o Postgres NAO converte text->enum
-- implicitamente numa atribuicao de coluna (so um literal desconhecido converge), toda
-- chamada que chega no UPDATE estoura:
--   42804: column "status" is of type multiplix_dispatch_status but expression is of type text
-- Ou seja: iniciar, pausar e cancelar disparo estao quebrados desde o Bloco C. Medido no
-- harness F57 (scripts/db-audit/multiplix-delivery-leases.test.sh), que aplica a cadeia
-- real de migrations e reproduz o erro identico.
--
-- PROVA de que a producao roda esse corpo: pg_proc.prosrc da funcao no banco canonico tem
-- md5 a7614f7cdebdc061554b80685a9ccf4d, 3766 chars, e o texto 'status       = v_next_status'
-- (com os MESMOS espacos do arquivo) — conferido em 02/10/2026.
--
-- Correcao minima: DOIS casts explicitos, os dois pontos que a f30 quebrou:
--   1. a atribuicao  SET status = v_next_status  (text -> enum);
--   2. o  RETURN QUERY SELECT ... v_dispatch.status ...  (agora enum, e a funcao
--      declara previous_status text) — sem o cast o erro e
--      42804/42702: structure of query does not match function result type.
-- O resto da funcao (contrato service_role, casos 'start'/'pause'/'cancel', F14 e o
-- sweeper) fica intacto.

CREATE OR REPLACE FUNCTION public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text DEFAULT NULL::text)
 RETURNS TABLE(dispatch_id uuid, previous_status text, current_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_next_status text;
  v_closed integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.multiplix_dispatches AS dispatch
  WHERE dispatch.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'start' THEN
      IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN
        RAISE EXCEPTION 'multiplix_dispatch_already_running' USING ERRCODE = '55001';
      END IF;
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused', 'sending') THEN
        RAISE EXCEPTION 'multiplix_dispatch_start_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
        RAISE EXCEPTION 'multiplix_dispatch_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_dispatch.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.multiplix_recipients AS recipient
           WHERE recipient.dispatch_id = p_dispatch_id
         ) THEN
        RAISE EXCEPTION 'multiplix_dispatch_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
    WHEN 'pause' THEN
      IF v_dispatch.status <> 'sending' THEN
        RAISE EXCEPTION 'multiplix_dispatch_pause_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
    WHEN 'cancel' THEN
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'multiplix_dispatch_cancel_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
  END CASE;

  -- F14: cancelar tem de encerrar a fila. Item sem POST ao provedor vira
  -- 'cancelled' (com motivo explicito); item em voo (provider_dispatch_started_at
  -- preenchido) fica intacto — o resultado dele ainda e desconhecido e o sweeper
  -- (abaixo) resolve para outcome_unknown.
  IF p_action = 'cancel' THEN
    UPDATE public.multiplix_recipients AS recipient
       SET status = 'cancelled',
           error_message = COALESCE(recipient.error_message, 'Cancelado pelo operador antes do envio'),
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           retry_after = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
       AND recipient.provider_dispatch_started_at IS NULL;

    GET DIAGNOSTICS v_closed = ROW_COUNT;

    -- F57 (achado): o comentario acima fala de ITEM, mas ate agora so a fila ANTIGA
    -- (multiplix_recipients) era encerrada. Com o worker por item (F55) isso deixa
    -- item pending na fila — e ele seria enviado DEPOIS de o operador cancelar, ou
    -- seja, mensagem indesejada para cliente real. Mesma regra: item sem POST ao
    -- provedor vira 'cancelled'; item JA enviado (provider_dispatch_started_at
    -- preenchido) fica intacto, porque o resultado dele ainda e desconhecido e quem
    -- resolve e o sweeper, nao um cancel cego.
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'cancelled',
           error_message = COALESCE(item.error_message, 'Cancelado pelo operador antes do envio'),
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
     WHERE item.dispatch_id = p_dispatch_id
       AND item.status IN ('pending', 'sending')
       AND item.provider_dispatch_started_at IS NULL;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
  SET status       = v_next_status::public.multiplix_dispatch_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(dispatch.started_at, statement_timestamp())
        ELSE dispatch.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE dispatch.paused_at END,
      completed_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE dispatch.completed_at END,
      updated_at   = statement_timestamp()
  WHERE dispatch.id = p_dispatch_id;

  RETURN QUERY SELECT p_dispatch_id, v_dispatch.status::text, v_next_status::text;
END;
$function$;
