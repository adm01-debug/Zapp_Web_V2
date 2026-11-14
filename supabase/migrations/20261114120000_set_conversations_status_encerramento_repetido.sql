-- set_conversations_status_encerramento_repetido
-- Rollback (SQL executável, na ordem; nenhum dado muda):
--   1. reexecutar o bloco "CREATE OR REPLACE FUNCTION public.set_conversation_status" e o
--      REVOKE/GRANT logo abaixo dele de 20261113171300_conversation_status_regras_e_so_por_rpc.sql
--      (volta o UPDATE antes do INSERT — e o 23505 para contato reaberto);
--   2. reexecutar o bloco "CREATE FUNCTION public.set_conversations_status" (trocando CREATE
--      por CREATE OR REPLACE), o REVOKE/GRANT e o COMMENT do mesmo arquivo.
--
-- O QUE ESTAVA ERRADO (causa raiz)
--   set_conversation_status (20261113171300) fazia UPDATE contacts SET
--   conversation_status='resolved' ANTES do INSERT em conversation_closures. O gatilho
--   BEFORE INSERT reject_repeated_conversation_closure_without_reopen (20261007013217) lê o
--   contato no INSERT: como ele já estava 'resolved' (NOT IN open/waiting), levantava
--   'conversation_closure_requires_reopen' (ERRCODE 23505) para QUALQUER contato que já foi
--   encerrado alguma vez, mesmo reaberto depois. Efeito: encerrar uma conversa reaberta pela
--   RPC unitária falhava; no lote (set_conversations_status) o 23505 não era capturado e
--   abortava o LOTE INTEIRO (nenhum id mudava). close_conversation_atomic faz INSERT e depois
--   UPDATE e não tinha o problema.
--
-- O QUE MUDA
--   1. set_conversation_status: o bloco "IF p_next = 'resolved' THEN INSERT ... END IF" vai
--      para ANTES do UPDATE (mesma ordem de close_conversation_atomic). Nada mais muda
--      (assinatura, SECURITY DEFINER, search_path, GRANTs, FSM, autorização). Com a ordem
--      nova: o gatilho de repetição lê open/waiting + a hora da reabertura (aceita reaberta,
--      recusa só encerramento sem reabertura); o AFTER INSERT sync_contact_status_on_closure
--      leva o contato a 'resolved' (FSM aceita open/waiting -> resolved; a guarda
--      guard_conversation_status_direct_update não barra: roda como o dono da função e com
--      pg_trigger_depth() > 1); o UPDATE seguinte é resolved -> resolved (gatilhos de FSM e de
--      guarda têm WHEN OLD IS DISTINCT FROM NEW e não disparam) e só grava
--      conversation_status_changed_at = NOW(), o mesmo valor do caminho antigo.
--   2. set_conversations_status: WHEN unique_violation -> outcome 'already_closed' para
--      aquele id, só para o caso legítimo que sobra (encerramento gravado depois da última
--      mudança de estado, sem reabertura); o subbloco desfaz aquele contato e o lote segue.
--      Resto do corpo, assinatura, SECURITY DEFINER, search_path e GRANTs = 20261113171300
--      (idênticos ao vivo em produção em 2026-11-14). O front (moveConversationsStatus) só
--      conta 'changed' como mudado; outcome novo é tratado como "não mudou".
--
-- PÓS-CONDIÇÕES: set_conversation_status grava o encerramento antes do UPDATE e mantém a
--   recusa waiting -> archived sem oráculo de UUID; set_conversations_status captura
--   unique_violation; anon sem EXECUTE.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public.set_conversations_status(uuid[], text, text, text, boolean)') IS NULL
     OR to_regprocedure('public.set_conversation_status(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: set_conversations_status/set_conversation_status ausentes (aplicar 20261113171300 antes)';
  END IF;
END
$pre$;

-- set_conversation_status: corpo de 20261113171300 (vigente em produção) com o encerramento
-- antes do UPDATE.
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

  -- Origem legada (pending/closed/NULL) de propósito sem caminho aqui (revisão #3064): em
  -- produção há 0 linhas nesses estados (SELECT de 2026-11-14: 4328 open, 17 resolved), a
  -- coluna é NOT NULL DEFAULT 'open' e nenhuma função/tela grava pending/closed; com 0 linhas
  -- o bloco $check$ acima troca o CHECK pelos 4 estados canônicos, então elas deixam de existir.
  IF v_current = 'open'     AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open', 'resolved')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open', 'archived')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                               THEN v_allowed := TRUE; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
  END IF;

  -- Encerramento ANTES do UPDATE (mesma ordem de close_conversation_atomic): o gatilho
  -- BEFORE INSERT reject_repeated_conversation_closure_without_reopen precisa ler o estado
  -- de ANTES (open/waiting + conversation_status_changed_at da reabertura). Com o UPDATE
  -- primeiro ele lia 'resolved' e recusava (23505) todo contato que já foi encerrado uma vez.
  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.contacts
  SET conversation_status            = p_next,
      conversation_status_changed_at = NOW()
  WHERE id = p_contact_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO postgres;

CREATE OR REPLACE FUNCTION public.set_conversations_status(
  p_contact_ids      uuid[],
  p_next             text,
  p_expected_current text DEFAULT NULL,
  p_reason           text DEFAULT NULL,
  p_restore          boolean DEFAULT false
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
    -- Revalida DEPOIS da trava (revisão #3064): a checagem acima pode ter lido o dono de
    -- antes de uma transferência concorrente que segurava a linha; o ramo p_restore não
    -- passa pela RPC unitária (que revalida sozinha).
    BEGIN
      PERFORM public.require_contact_edit_permission(v_id);
    EXCEPTION WHEN insufficient_privilege THEN
      outcome := 'not_authorized';
      RETURN NEXT;
      CONTINUE;
    END;
    previous_status := v_current;

    IF v_current IS NOT DISTINCT FROM p_next THEN
      outcome := 'already_in_state';
    ELSIF p_expected_current IS NOT NULL AND v_current IS DISTINCT FROM p_expected_current THEN
      outcome := 'state_changed';
    ELSIF COALESCE(p_restore, false) AND p_next = 'resolved' THEN
      -- Desfazer de arquivamento de conversa encerrada: volta a 'resolved' sem novo
      -- encerramento (as duas transições passam pela FSM; nenhuma é nova).
      IF v_current = 'archived'
         AND EXISTS (SELECT 1 FROM public.conversation_closures cc WHERE cc.contact_id = v_id) THEN
        UPDATE public.contacts SET conversation_status = 'open',     conversation_status_changed_at = NOW() WHERE id = v_id;
        UPDATE public.contacts SET conversation_status = 'resolved', conversation_status_changed_at = NOW() WHERE id = v_id;
        outcome := 'changed';
      ELSE
        outcome := 'invalid_transition';
      END IF;
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
        -- 23505 do gatilho reject_repeated_conversation_closure_without_reopen: só o caso
        -- legítimo — encerramento gravado DEPOIS da última mudança de estado (não houve
        -- reabertura desde ele). Reaberta de verdade encerra normalmente (set_conversation_status
        -- grava o encerramento antes do UPDATE). Desfaz só este id; o lote segue.
        WHEN unique_violation THEN outcome := 'already_closed';
      END;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_conversations_status(uuid[], text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversations_status(uuid[], text, text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_conversations_status(uuid[], text, text, text, boolean) IS
  'P1-2 (2026-11-13): set_conversation_status em lote (até 500, em ordem de id). p_expected_current = só muda quem ainda está nesse estado. Devolve UMA linha por id: outcome changed | already_in_state | state_changed | waiting_cannot_be_archived | invalid_transition | already_closed | not_authorized (inexistente e sem permissão têm a mesma resposta; previous_status só é devolvido depois da autorização). already_closed (2026-11-14) = o contato tem encerramento gravado depois da última mudança de estado, sem reabertura desde então (23505 do gatilho de conversation_closures); o contato não muda e o lote segue. Conversa reaberta encerra normalmente (changed). p_restore=true: desfazer de arquivamento archived -> resolved sem novo encerramento (só com encerramento prévio).';

DO $post$
DECLARE
  v_def text := pg_get_functiondef('public.set_conversation_status(uuid, text, text)'::regprocedure);
BEGIN
  IF position('INSERT INTO public.conversation_closures' IN v_def) = 0
     OR position('INSERT INTO public.conversation_closures' IN v_def) > position('UPDATE public.contacts' IN v_def) THEN
    RAISE EXCEPTION 'pos-condicao: set_conversation_status ainda faz o UPDATE antes do encerramento';
  END IF;
  IF position('conversation_waiting_cannot_be_archived' IN v_def) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: waiting -> archived ainda aceito';
  END IF;
  IF position('contact not found' IN v_def) > 0 THEN
    RAISE EXCEPTION 'pos-condicao: set_conversation_status reabriu o oraculo de UUID (SEC-RLS-02)';
  END IF;
  IF position('unique_violation' IN pg_get_functiondef('public.set_conversations_status(uuid[], text, text, text, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: set_conversations_status ainda deixa 23505 abortar o lote';
  END IF;
  IF has_function_privilege('anon', 'public.set_conversation_status(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_conversations_status(uuid[], text, text, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: anon nao pode executar set_conversation_status/set_conversations_status';
  END IF;
END
$post$;

COMMIT;
