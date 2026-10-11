-- set_conversation_status_waiting_para_archived
-- Rollback: recria public.set_conversation_status com o corpo anterior (waiting -> open|resolved, sem archived) e reemite os grants.
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$ DECLARE v_current TEXT; v_allowed BOOLEAN := FALSE; BEGIN SELECT conversation_status INTO v_current FROM public.contacts WHERE id = p_contact_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'contact not found: %', p_contact_id; END IF; PERFORM public.require_contact_edit_permission(p_contact_id); IF v_current = p_next THEN RETURN; END IF; IF v_current = 'open' AND p_next IN ('waiting','resolved','archived') THEN v_allowed := TRUE; END IF; IF v_current = 'waiting' AND p_next IN ('open','resolved') THEN v_allowed := TRUE; END IF; IF v_current = 'resolved' AND p_next IN ('open','archived') THEN v_allowed := TRUE; END IF; IF v_current = 'archived' AND p_next = 'open' THEN v_allowed := TRUE; END IF; IF NOT v_allowed THEN RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next; END IF; UPDATE public.contacts SET conversation_status = p_next, conversation_status_changed_at = NOW() WHERE id = p_contact_id; IF p_next = 'resolved' THEN INSERT INTO public.conversation_closures (contact_id, close_reason) VALUES (p_contact_id, COALESCE(p_reason, 'resolved')) ON CONFLICT DO NOTHING; END IF; END; $$;
--   REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO postgres;
--
-- ADR-005 (docs/adr/ADR-005-conversation-state-machine.md), tabela de transicoes, linha
-- 'waiting' / coluna 'archived' = agente: a maquina de estados permite que uma conversa
-- em 'waiting' (na fila, ex.: fila Talk Me) seja ARQUIVADA. O gatilho de banco
-- public.enforce_conversation_status_transition ja aceita waiting -> archived
-- (20260929560000_contacts_conversation_status_and_grants.sql); a RPC
-- public.set_conversation_status ficou para tras e recusava com
-- 'invalid transition waiting -> archived'.
--
-- Esta migration e ADITIVA no efeito: um unico ramo da tabela de transicoes da RPC ganha
-- 'archived'. Corpo IDENTICO ao vigente (20260930090000_harden_status_and_wa_tag_rpc_authorization.sql),
-- inclusive a autorizacao public.require_contact_edit_permission ANTES de qualquer efeito e
-- ANTES do no-op idempotente, e o mesmo INSERT em conversation_closures ao resolver. Nada mais
-- muda: assinatura (uuid, text, text), retorno void, SECURITY DEFINER, SET search_path,
-- REVOKE e GRANT reemitidos iguais.

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

  -- Autorizacao ANTES de qualquer efeito e antes do no-op idempotente: um chamador
  -- sem permissao nao pode inferir o estado atual do contato pelo silencio da RPC.
  PERFORM public.require_contact_edit_permission(p_contact_id);

  -- No-op idempotente: ja esta no estado desejado
  -- (fixture E2E seguro para re-execucao mesmo que test 1 nao tenha fechado)
  IF v_current = p_next THEN
    RETURN;
  END IF;

  IF v_current = 'open'     AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open', 'resolved', 'archived')    THEN v_allowed := TRUE; END IF;
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
