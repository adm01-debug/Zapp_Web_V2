CREATE OR REPLACE FUNCTION public.mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'invalid_delivery_post_mark' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fencing: só o dono do lease corrente, em 'sending' e sem recibo.
  IF v_message.delivery_claim_token IS DISTINCT FROM p_claim_token
     OR v_message.sender IS DISTINCT FROM 'agent'
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- O POST só pode começar sob lease vivo: vencido, a marca é recusada (mesmo
  -- que já exista carimbo) para a Edge NÃO disparar. Vem ANTES do retorno
  -- idempotente: repetir a marca com o mesmo token depois do vencimento não pode
  -- autorizar um POST fora do lease.
  IF v_message.delivery_claim_expires_at IS NULL
     OR v_message.delivery_claim_expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'delivery_claim_expired' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotente: repetir com o MESMO token, sob o MESMO lease, devolve o carimbo
  -- já gravado. Carimbo de um lease ANTERIOR (anterior ao claim corrente) é POST
  -- possivelmente já enviado: nunca vira sucesso para o lease novo.
  IF v_message.delivery_post_started_at IS NOT NULL THEN
    IF v_message.delivery_claimed_at IS NOT NULL
       AND v_message.delivery_post_started_at >= v_message.delivery_claimed_at THEN
      RETURN v_message;
    END IF;
    RAISE EXCEPTION 'outbound_post_already_started' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET delivery_post_started_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$
