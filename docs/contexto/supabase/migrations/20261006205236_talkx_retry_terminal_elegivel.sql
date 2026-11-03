CREATE OR REPLACE FUNCTION public.retry_talkx_recipient(p_recipient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign_id uuid;
  v_recipient   public.talkx_recipients%ROWTYPE;
  v_campaign    public.talkx_campaigns%ROWTYPE;
  v_reopened    boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_id IS NULL THEN
    RETURN false;
  END IF;

  -- Ordem de trava igual à do motor (campanha antes do destinatário), para não
  -- cruzar com claim_talkx_campaign_worker/claim_talkx_recipient nem com a RPC de
  -- retry em lote da X031.
  SELECT recipient.campaign_id INTO v_campaign_id
    FROM public.talkx_recipients AS recipient
   WHERE recipient.id = p_recipient_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = v_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_campaign.status NOT IN ('sending', 'paused', 'completed') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_recipient
    FROM public.talkx_recipients AS recipient
   WHERE recipient.id = p_recipient_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Estado ambíguo: reenviar sem contrato de idempotência do provedor arrisca
  -- mensagem em dobro. A decisão é da RPC de resolução, com confirmação explícita.
  IF v_recipient.status = 'outcome_unknown' THEN
    RAISE EXCEPTION 'talkx_outcome_unknown_requires_reconciliation' USING ERRCODE = '55000';
  END IF;
  IF v_recipient.status <> 'failed' THEN
    RETURN false;
  END IF;
  IF v_recipient.attempt_count >= 3 THEN
    RETURN false;
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET status                       = 'pending',
         attempt_count                = recipient.attempt_count + 1,
         retry_after                  = statement_timestamp(),
         error_message                = NULL,
         provider_dispatch_started_at = NULL,
         delivery_claim_token         = NULL,
         delivery_claimed_at          = NULL,
         delivery_claim_expires_at    = NULL,
         delivery_claimed_by          = NULL,
         delivery_last_claim_token    = NULL,
         updated_at                   = statement_timestamp()
   WHERE recipient.id = p_recipient_id;

  v_reopened := (v_campaign.status = 'completed');

  -- O guard de talkx_campaigns (enforce_talkx_campaign_mutability) devolve cedo para
  -- quem não é 'authenticated' e esta RPC é service_role-only (checagem acima), então
  -- o ajuste de contador e a reabertura não precisam da fuga transacional
  -- app.talkx_retry_write — aquela existe porque a RPC da X031 é chamada por
  -- 'authenticated'. Nenhum GUC é ligado aqui de propósito.
  UPDATE public.talkx_campaigns AS campaign
     SET failed_count = GREATEST(campaign.failed_count - 1, 0),
         status       = CASE WHEN campaign.status = 'completed' THEN 'sending' ELSE campaign.status END,
         completed_at = CASE WHEN campaign.status = 'completed' THEN NULL ELSE campaign.completed_at END,
         updated_at   = statement_timestamp()
   WHERE campaign.id = v_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (v_campaign_id, 'note', jsonb_build_object(
            'action', 'retry_talkx_recipient',
            'recipient_id', p_recipient_id,
            'previous_status', v_recipient.status,
            'previous_provider_dispatch_started_at', v_recipient.provider_dispatch_started_at,
            'attempt_count', v_recipient.attempt_count + 1,
            'campaign_reopened', v_reopened
          )::text, NULL);

  IF v_reopened THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (v_campaign_id, 'resumed', NULL, NULL);
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_talkx_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_talkx_recipient(uuid) TO service_role;

COMMENT ON FUNCTION public.retry_talkx_recipient(uuid) IS
  'Talk X (R2-DB-015): retry manual de UM destinatário failed, service_role. Devolve o item a pending ELEGÍVEL (limpa provider_dispatch_started_at e o claim, retry_after = now()), reduz failed_count e reabre campanha completed -> sending com evento. outcome_unknown não é reaberto aqui: exige resolve_talkx_outcome_unknown (X031).';

-- Fail-closed: sem os objetos que sustentam a promessa de elegibilidade, aborta.
DO $guard$
BEGIN
  IF to_regprocedure('public.retry_talkx_recipient(uuid)') IS NULL THEN
    RAISE EXCEPTION 'talkx_retry_terminal_elegivel_ausente: public.retry_talkx_recipient(uuid)';
  END IF;
  IF to_regprocedure('public.talkx_next_recipients(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'talkx_retry_terminal_elegivel_ausente: public.talkx_next_recipients(uuid,integer)';
  END IF;
END;
$guard$;
