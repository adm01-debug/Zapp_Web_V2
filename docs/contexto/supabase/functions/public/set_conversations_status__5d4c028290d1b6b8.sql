CREATE OR REPLACE FUNCTION public.set_conversations_status(p_contact_ids uuid[], p_next text, p_expected_current text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_restore boolean DEFAULT false)
 RETURNS TABLE(contact_id uuid, previous_status text, outcome text)
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
      END;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$
