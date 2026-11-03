CREATE OR REPLACE FUNCTION public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Autorizacao (e, para o chamador comum, tambem a EXISTENCIA) em UM unico ponto. Antes da
  -- correcao, esta RPC levantava 'contact not found: <uuid>' aqui -- o mesmo oraculo de UUID do
  -- SEC-RLS-02 por outro caminho (SEC-RLS-02: qualquer `authenticated` enumera contatos).
  PERFORM public.require_contact_edit_permission(p_contact_id);

  -- Chamador privilegiado (service_role/postgres/cron): require_contact_edit_permission nao checa
  -- existencia, entao a inexistencia e recusada com a MESMA excecao de autorizacao -- nada aqui
  -- distingue "nao existe" de "nao posso ver".
  IF NOT v_encontrado THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- No-op idempotente: ja esta no estado desejado (o no-op VEM DEPOIS da autorizacao: um chamador
  -- sem permissao nao pode inferir o estado atual do contato pelo silencio da RPC).
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
$function$
