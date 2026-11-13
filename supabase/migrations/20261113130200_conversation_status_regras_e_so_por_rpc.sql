-- conversation_status_regras_e_so_por_rpc
-- Auditoria Conversas 2026-11-13, P1-2.
--
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.set_conversations_status(uuid[], text, text, text);
--   drop trigger if exists trg_contacts_conversation_status_rpc_only on public.contacts;
--   drop function if exists public.guard_conversation_status_direct_update();
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
--        waiting  -> open | resolved | archived      (waiting->archived: ADR-005, já
--                                                    aceito pela RPC desde 20261016010011)
--        resolved -> open | archived
--        archived -> open
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
--      autorização e pela FSM da RPC unitária; o que não pode/não casa é pulado (como
--      o RLS fazia), e a RPC devolve (contact_id, previous_status) do que mudou.
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
SET search_path TO 'public'
AS $function$ BEGIN
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.conversation_status IS NULL AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved', 'archived')) OR
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

CREATE OR REPLACE FUNCTION public.set_conversations_status(
  p_contact_ids      uuid[],
  p_next             text,
  p_expected_current text DEFAULT NULL,
  p_reason           text DEFAULT NULL
)
RETURNS TABLE (contact_id uuid, previous_status text)
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

  FOR v_id IN SELECT DISTINCT unnest(p_contact_ids) LOOP
    CONTINUE WHEN v_id IS NULL;
    SELECT c.conversation_status INTO v_current
      FROM public.contacts c
     WHERE c.id = v_id
     FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN v_current IS NOT DISTINCT FROM p_next;
    CONTINUE WHEN p_expected_current IS NOT NULL AND v_current IS DISTINCT FROM p_expected_current;
    BEGIN
      -- Mesma autorização (require_contact_edit_permission) e mesma FSM da RPC unitária.
      PERFORM public.set_conversation_status(v_id, p_next, p_reason);
      contact_id := v_id;
      previous_status := v_current;
      RETURN NEXT;
    EXCEPTION
      WHEN insufficient_privilege OR raise_exception OR check_violation THEN
        -- Sem permissão / transição inválida: pula este contato, como o RLS fazia.
        NULL;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_conversations_status(uuid[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversations_status(uuid[], text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_conversations_status(uuid[], text, text, text) IS
  'P1-2 (2026-11-13): set_conversation_status em lote (até 500). p_expected_current = só muda quem ainda está nesse estado. Pula sem erro quem não pode/não casa. Devolve (contact_id, previous_status) do que mudou.';

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
END
$post$;

COMMIT;
