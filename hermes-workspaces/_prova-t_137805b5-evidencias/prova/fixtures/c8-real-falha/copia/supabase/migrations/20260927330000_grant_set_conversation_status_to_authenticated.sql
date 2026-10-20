-- migration: 20260927330000
-- Problema 1 (critico): set_conversation_status so tinha GRANT para service_role.
-- O fixture E2E (ensureFixtureConversationOpen) usa JWT do usuario logado
-- (authenticated) via page.request.post -> PostgREST retornava 403
-- 'permission denied for function set_conversation_status', fazendo
-- o e2e-logado continuar falhando mesmo apos o fix do PR #980 (RPC vs PATCH).
--
-- Problema 2 (medio): transicao open->open levantava EXCEPTION em vez de ser
-- um no-op, o que quebraria o fixture se o test 1 crashasse sem fechar.
--
-- Fix:
--   1. Adicionar open->open como RETURN imediato (no-op idempotente)
--   2. GRANT EXECUTE TO authenticated (anon permanece bloqueado)
--
-- Seguranca: a funcao valida a FSM antes de qualquer UPDATE; um usuario
-- authenticated so pode fazer transicoes validas (open->resolved etc.).
-- TODO de seguranca futura: adicionar check de assigned_to para limitar quais
-- contatos podem ser transicionados por agentes comuns (vs admin).

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
  v_current TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  -- No-op idempotente: ja esta no estado desejado
  -- (fixture E2E seguro para re-execucao mesmo que test 1 nao tenha fechado)
  IF v_current = p_next THEN
    RETURN;
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

-- Revogar PUBLIC (default PostgreSQL) e conceder explicitamente
REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO postgres;
