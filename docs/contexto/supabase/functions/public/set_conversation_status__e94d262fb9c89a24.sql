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
