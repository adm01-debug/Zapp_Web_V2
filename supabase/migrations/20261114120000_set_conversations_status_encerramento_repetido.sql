-- set_conversations_status_encerramento_repetido
-- Rollback (SQL executável): reexecutar o bloco "CREATE FUNCTION public.set_conversations_status"
--   (trocando CREATE por CREATE OR REPLACE), o REVOKE/GRANT e o COMMENT de
--   20261113171300_conversation_status_regras_e_so_por_rpc.sql. Nenhum dado muda.
--
-- O QUE ESTAVA ERRADO
--   set_conversations_status(p_next='resolved', sem p_restore) chama
--   set_conversation_status, que faz INSERT em conversation_closures. Se o contato já
--   tem encerramento sem reabertura depois dele, o gatilho BEFORE INSERT
--   reject_repeated_conversation_closure_without_reopen (20261007013217) levanta
--   'conversation_closure_requires_reopen' com ERRCODE 23505 (unique_violation). O
--   EXCEPTION do lote só capturava insufficient_privilege, check_violation e
--   raise_exception: o 23505 escapava e abortava o LOTE INTEIRO (nenhum outro id mudava
--   e o front recebia erro), em vez de uma linha por id.
--
-- O QUE MUDA
--   Só o tratamento: WHEN unique_violation -> outcome 'already_closed' para aquele id.
--   O subbloco desfaz a mudança daquele contato (fica no estado em que estava, sem
--   encerramento novo) e os demais ids do lote seguem normalmente. Assinatura, SECURITY
--   DEFINER, search_path, GRANTs e o resto do corpo são os de 20261113171300 (idênticos
--   ao vivo em produção em 2026-11-14). O front (moveConversationsStatus) só conta
--   'changed' como mudado; outcome novo é tratado como "não mudou".
--
-- PÓS-CONDIÇÕES: set_conversations_status captura unique_violation; anon sem EXECUTE.

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
        -- 23505 do gatilho reject_repeated_conversation_closure_without_reopen: o contato já
        -- tem encerramento sem reabertura. Desfaz só este id; o lote segue.
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
  'P1-2 (2026-11-13): set_conversation_status em lote (até 500, em ordem de id). p_expected_current = só muda quem ainda está nesse estado. Devolve UMA linha por id: outcome changed | already_in_state | state_changed | waiting_cannot_be_archived | invalid_transition | already_closed | not_authorized (inexistente e sem permissão têm a mesma resposta; previous_status só é devolvido depois da autorização). already_closed (2026-11-14) = encerrar contato que já tem encerramento sem reabertura (23505 do gatilho de conversation_closures); o contato não muda e o lote segue. p_restore=true: desfazer de arquivamento archived -> resolved sem novo encerramento (só com encerramento prévio).';

DO $post$
BEGIN
  IF position('unique_violation' IN pg_get_functiondef('public.set_conversations_status(uuid[], text, text, text, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pos-condicao: set_conversations_status ainda deixa 23505 abortar o lote';
  END IF;
  IF has_function_privilege('anon', 'public.set_conversations_status(uuid[], text, text, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos-condicao: anon nao pode executar set_conversations_status';
  END IF;
END
$post$;

COMMIT;
