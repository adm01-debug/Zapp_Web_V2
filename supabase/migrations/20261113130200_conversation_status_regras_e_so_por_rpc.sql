-- conversation_status_regras_e_so_por_rpc
-- Auditoria Conversas 2026-11-13, P1-2.
--
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.set_conversations_status(uuid[], text, text, text);
--   drop trigger if exists trg_contacts_conversation_status_rpc_only on public.contacts;
--   drop function if exists public.guard_conversation_status_direct_update();
--   -- set_conversation_status anterior: reexecutar o CREATE OR REPLACE FUNCTION
--   -- public.set_conversation_status de 20261009055051_sec_rls_02_03_oraculo_uuid_contato.sql
--   -- (corpo vigente em produção, sem oráculo de UUID). NÃO usar o de 20261016010011
--   -- (reabre o oráculo SEC-RLS-02).
--   -- FSM e CHECK anteriores: reexecutar o CREATE OR REPLACE FUNCTION
--   -- public.enforce_conversation_status_transition() e o bloco
--   -- "ALTER TABLE public.contacts ... chk_conversation_status_values" de
--   -- 20260929560000_contacts_conversation_status_and_grants.sql.
--
-- O QUE ESTAVA ERRADO
--   1. O gatilho de FSM e o CHECK aceitavam 'pending'/'closed' (nenhuma aba mostra
--      esses estados) e transições fora da regra (resolved->pending/closed,
--      archived->pending, closed->...). Uma conversa podia "sumir" do Inbox.
--   2. authenticated tinha UPDATE direto em contacts.conversation_status (policy
--      "Users can update their assigned contacts"): o PATCH pulava a RPC
--      set_conversation_status, que é quem checa permissão e grava o encerramento.
--
-- O QUE MUDA
--   1. FSM = docs/contexto/regras/manual/regras.md §4.1 + ADR-005:
--        open     -> waiting | resolved | archived
--        waiting  -> open | resolved
--        resolved -> open | archived
--        archived -> open
--      waiting -> archived é RECUSADO (decisão do dono, 2026-11-13): conversa aguardando
--      atendimento não pode sumir da fila sem ninguém atender — precisa ser atendida
--      (open) ou encerrada (resolved) antes. Erro claro:
--      'conversation_waiting_cannot_be_archived' (check_violation). Isto supera o ponto
--      da ADR-005 / 20261016010011 que permitia a transição. set_conversation_status é
--      recriada a partir do corpo de PRODUÇÃO (20261009055051, sem oráculo de UUID — SEC-RLS-02).
--      Reabrir sem dono vai para 'waiting' em DOIS passos (archived/resolved -> open
--      -> waiting, reopen_conversation_core), então não precisa de resolved->waiting.
--      Linhas legadas em 'pending'/'closed' (se houver) só podem SAIR para um estado
--      canônico; ninguém entra mais nesses estados.
--   2. CHECK com só os 4 estados canônicos — APENAS se não houver linha legada
--      (senão mantém o CHECK atual e avisa por NOTICE; ver pré-checagem no PR).
--   3. Gatilho guard_conversation_status_direct_update: mudar conversation_status por
--      UPDATE direto como authenticated/anon é recusado (42501
--      conversation_status_requires_rpc). Caminhos legítimos continuam:
--        - RPCs SECURITY DEFINER (set_conversation_status, close_conversation_atomic,
--          reopen_conversation, transfer_conversation, assume/return, talk_me_claim,
--          ingest_inbound_message...): rodam como o dono da função, não como
--          authenticated;
--        - gatilhos encadeados (ex.: sync_contact_status_on_closure, AFTER INSERT em
--          conversation_closures): pg_trigger_depth() > 1;
--        - service_role / postgres.
--   4. RPC nova public.set_conversations_status(ids[], próximo, esperado, motivo): o
--      mesmo set_conversation_status para um LOTE numa ida só (arquivar em massa e o
--      "Desfazer" do front, que antes faziam UPDATE direto). Cada contato passa pela
--      autorização e pela FSM da RPC unitária, em ordem de id (sem deadlock entre lotes).
--      Devolve uma linha por id com `outcome` (changed, already_in_state, state_changed,
--      waiting_cannot_be_archived, invalid_transition, not_authorized) — nada é engolido
--      em silêncio. Autorização vem antes de qualquer leitura de estado (sem oráculo).
--
-- PÓS-CONDIÇÕES: gatilho de guarda presente; RPC de lote só para authenticated.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public.set_conversation_status(uuid, text, text)') IS NULL
     OR to_regprocedure('public.enforce_conversation_status_transition()') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: set_conversation_status/enforce_conversation_status_transition ausentes';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.enforce_conversation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  -- Decisão do dono (2026-11-13): aguardando não é arquivada.
  IF OLD.conversation_status = 'waiting' AND NEW.conversation_status = 'archived' THEN
    RAISE EXCEPTION 'conversation_waiting_cannot_be_archived'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Conversa aguardando atendimento não pode ser arquivada. Atenda ou encerre antes.';
  END IF;

  IF NOT (
    (OLD.conversation_status IS NULL AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open') OR
    -- Legado (pré-§4.1): só sai para um estado canônico.
    (OLD.conversation_status IN ('pending', 'closed') AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_conversation_status_transition() FROM PUBLIC, anon;

DO $check$
DECLARE
  v_legacy bigint;
BEGIN
  SELECT count(*) INTO v_legacy
    FROM public.contacts
   WHERE conversation_status IN ('pending', 'closed');
  IF v_legacy = 0 THEN
    ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS chk_conversation_status_values;
    ALTER TABLE public.contacts
      ADD CONSTRAINT chk_conversation_status_values
      CHECK (conversation_status IS NULL OR conversation_status IN ('open', 'waiting', 'resolved', 'archived'));
    COMMENT ON CONSTRAINT chk_conversation_status_values ON public.contacts IS
      'Estados canônicos de conversa (regras.md §4.1): open, waiting, resolved, archived. Sincronizar com enforce_conversation_status_transition.';
  ELSE
    RAISE NOTICE 'CHECK mantido com pending/closed: % contato(s) legado(s). A FSM já impede ENTRAR nesses estados.', v_legacy;
  END IF;
END
$check$;

-- set_conversation_status: parte do corpo VIGENTE EM PRODUÇÃO (20261009055051, SEC-RLS-02 —
-- sem oráculo de UUID: inexistente e fora do alcance recebem a MESMA recusa
-- 'contact_not_authorized' 42501, depois da autorização). Muda só: recusa explícita de
-- waiting -> archived (decisão do dono) DEPOIS da autorização e do no-op, para não virar
-- oráculo de estado.
CREATE OR REPLACE FUNCTION public.set_conversation_status(
  p_contact_id uuid,
  p_next       text,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_current    TEXT;
  v_encontrado boolean;
  v_allowed    BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;
  v_encontrado := FOUND;

  -- Autorização (e, para o chamador comum, também a EXISTÊNCIA) em UM único ponto (SEC-RLS-02).
  PERFORM public.require_contact_edit_permission(p_contact_id);

  -- Chamador privilegiado: require_contact_edit_permission não checa existência; a inexistência
  -- é recusada com a MESMA exceção de autorização.
  IF NOT v_encontrado THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_current = p_next THEN
    RETURN;
  END IF;

  -- Decisão do dono (2026-11-13): aguardando não é arquivada.
  IF v_current = 'waiting' AND p_next = 'archived' THEN
    RAISE EXCEPTION 'conversation_waiting_cannot_be_archived'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Conversa aguardando atendimento não pode ser arquivada. Atenda ou encerre antes.';
  END IF;

  IF v_current = 'open'     AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open', 'resolved')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open', 'archived')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                               THEN v_allowed := TRUE; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
  END IF;

  UPDATE public.contacts
  SET conversation_status            = p_next,
      conversation_status_changed_at = NOW()
  WHERE id = p_contact_id;

  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO postgres;

CREATE OR REPLACE FUNCTION public.guard_conversation_status_direct_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- current_user é o papel EFETIVO: dentro de uma RPC SECURITY DEFINER é o dono da
  -- função; só um UPDATE direto do cliente chega aqui como authenticated/anon.
  IF current_user IN ('authenticated', 'anon') AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'conversation_status_requires_rpc'
      USING ERRCODE = '42501',
            HINT = 'Use set_conversation_status / set_conversations_status / close_conversation_atomic / reopen_conversation.';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_conversation_status_direct_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contacts_conversation_status_rpc_only ON public.contacts;
CREATE TRIGGER trg_contacts_conversation_status_rpc_only
BEFORE UPDATE OF conversation_status ON public.contacts
FOR EACH ROW
WHEN (OLD.conversation_status IS DISTINCT FROM NEW.conversation_status)
EXECUTE FUNCTION public.guard_conversation_status_direct_update();

DROP FUNCTION IF EXISTS public.set_conversations_status(uuid[], text, text, text);
CREATE FUNCTION public.set_conversations_status(
  p_contact_ids      uuid[],
  p_next             text,
  p_expected_current text DEFAULT NULL,
  p_reason           text DEFAULT NULL
)
RETURNS TABLE (contact_id uuid, previous_status text, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id      uuid;
  v_current text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_next IS NULL OR p_next NOT IN ('open', 'waiting', 'resolved', 'archived') THEN
    RAISE EXCEPTION 'invalid_conversation_status' USING ERRCODE = '22023';
  END IF;
  IF p_expected_current IS NOT NULL
     AND p_expected_current NOT IN ('open', 'waiting', 'resolved', 'archived', 'pending', 'closed') THEN
    RAISE EXCEPTION 'invalid_conversation_status' USING ERRCODE = '22023';
  END IF;
  IF p_contact_ids IS NULL OR cardinality(p_contact_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_contact_ids) > 500 THEN
    RAISE EXCEPTION 'too_many_contacts' USING ERRCODE = '22023';
  END IF;

  -- ORDER BY: duas chamadas concorrentes travam as linhas na MESMA ordem (sem deadlock).
  FOR v_id IN SELECT DISTINCT u.id FROM unnest(p_contact_ids) AS u(id) WHERE u.id IS NOT NULL ORDER BY u.id LOOP
    contact_id := v_id;
    previous_status := NULL;

    -- Autorização PRIMEIRO (SEC-RLS-02): inexistente e fora do alcance têm a MESMA
    -- resposta ('not_authorized') e nenhum estado é revelado antes disso.
    BEGIN
      PERFORM public.require_contact_edit_permission(v_id);
    EXCEPTION WHEN insufficient_privilege THEN
      outcome := 'not_authorized';
      RETURN NEXT;
      CONTINUE;
    END;

    SELECT c.conversation_status INTO v_current
      FROM public.contacts c
     WHERE c.id = v_id
     FOR UPDATE;
    IF NOT FOUND THEN
      outcome := 'not_authorized';
      RETURN NEXT;
      CONTINUE;
    END IF;
    previous_status := v_current;

    IF v_current IS NOT DISTINCT FROM p_next THEN
      outcome := 'already_in_state';
    ELSIF p_expected_current IS NOT NULL AND v_current IS DISTINCT FROM p_expected_current THEN
      outcome := 'state_changed';
    ELSE
      BEGIN
        -- Mesma autorização e mesma FSM da RPC unitária.
        PERFORM public.set_conversation_status(v_id, p_next, p_reason);
        outcome := 'changed';
      EXCEPTION
        WHEN insufficient_privilege THEN outcome := 'not_authorized';
        WHEN check_violation THEN
          outcome := CASE WHEN SQLERRM LIKE '%conversation_waiting_cannot_be_archived%'
                          THEN 'waiting_cannot_be_archived' ELSE 'invalid_transition' END;
        WHEN raise_exception THEN outcome := 'invalid_transition';
      END;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_conversations_status(uuid[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversations_status(uuid[], text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_conversations_status(uuid[], text, text, text) IS
  'P1-2 (2026-11-13): set_conversation_status em lote (até 500, em ordem de id). p_expected_current = só muda quem ainda está nesse estado. Devolve UMA linha por id: outcome changed | already_in_state | state_changed | waiting_cannot_be_archived | invalid_transition | not_authorized (inexistente e sem permissão têm a mesma resposta; previous_status só é devolvido depois da autorização).';

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.contacts'::regclass
       AND tgname = 'trg_contacts_conversation_status_rpc_only'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'pos-condicao: gatilho de guarda ausente';
  END IF;
  IF has_function_privilege('anon', 'public.set_conversations_status(uuid[], text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: anon nao pode executar set_conversations_status';
  END IF;
  IF position('conversation_waiting_cannot_be_archived' IN pg_get_functiondef('public.set_conversation_status(uuid, text, text)'::regprocedure)) = 0
     OR position('conversation_waiting_cannot_be_archived' IN pg_get_functiondef('public.enforce_conversation_status_transition()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: waiting -> archived ainda aceito';
  END IF;
  IF position('contact not found' IN pg_get_functiondef('public.set_conversation_status(uuid, text, text)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'pos-condicao: set_conversation_status reabriu o oraculo de UUID (SEC-RLS-02)';
  END IF;
END
$post$;

COMMIT;
