CREATE OR REPLACE FUNCTION public.resolve_talkx_outcome_unknown(p_recipient_id uuid, p_resolution text, p_note text DEFAULT NULL::text, p_confirm_duplicate_risk boolean DEFAULT false, p_confirm_relaunch boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor     uuid;
  v_recipient public.talkx_recipients%ROWTYPE;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_reopened  boolean := false;
  v_new_status text;
  v_resolution text;
  v_message   jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_outcome_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_id IS NULL OR p_resolution IS NULL
     OR p_resolution NOT IN ('mark_sent', 'mark_failed', 'retry') THEN
    RAISE EXCEPTION 'invalid_talkx_outcome_resolution' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'invalid_talkx_outcome_note' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'retry' AND p_confirm_duplicate_risk IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_duplicate_risk_confirmation_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_recipient
    FROM public.talkx_recipients AS recipient
   WHERE recipient.id = p_recipient_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_recipient.status <> 'outcome_unknown' THEN
    RAISE EXCEPTION 'talkx_recipient_not_outcome_unknown' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = v_recipient.campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.talkx_retry_write', 'on', true);

  IF p_resolution = 'mark_sent' THEN
    UPDATE public.talkx_recipients AS recipient
       SET status = 'sent',
           sent_at = COALESCE(recipient.sent_at, statement_timestamp()),
           error_message = NULL,
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           sent_count = campaign.sent_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'sent';
    v_resolution := 'mark_sent';

  ELSIF p_resolution = 'mark_failed' THEN
    UPDATE public.talkx_recipients AS recipient
       SET status = 'failed',
           error_message = COALESCE(NULLIF(btrim(p_note), ''), 'Resolvido manualmente como falha'),
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           failed_count = campaign.failed_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'failed';
    v_resolution := 'mark_failed';

  ELSE
    -- retry: confirmação explícita de risco de mensagem em dobro já exigida acima.
    -- #124 (R3-DELTA-005): com a campanha 'completed' o retry REABRE a campanha — e um novo
    -- lancamento. Exige tambem a nova confirmacao de lancamento do operador; sem ela, nada
    -- e escrito (o destinatario segue outcome_unknown e a campanha segue completed). A
    -- confirmacao so vale com legal_basis gravada; base nula/vazia tambem falha fechado.
    IF v_campaign.status = 'completed'
       AND (
         p_confirm_relaunch IS NOT TRUE
         OR NULLIF(btrim(COALESCE(v_campaign.legal_basis, '')), '') IS NULL
       ) THEN
      RAISE EXCEPTION 'talkx_relaunch_confirmation_required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.talkx_recipients AS recipient
       SET status = 'pending',
           retry_after = statement_timestamp(),
           manual_retry_count = recipient.manual_retry_count + 1,
           error_message = NULL,
           provider_dispatch_started_at = NULL,
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    v_reopened := (v_campaign.status = 'completed');

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           status = CASE WHEN campaign.status = 'completed' THEN 'sending' ELSE campaign.status END,
           completed_at = CASE WHEN campaign.status = 'completed' THEN NULL ELSE campaign.completed_at END,
           -- #124: reabertura grava o carimbo da NOVA confirmacao (autor + instante).
           consent_confirmed_by = CASE WHEN campaign.status = 'completed' THEN v_actor ELSE campaign.consent_confirmed_by END,
           consent_confirmed_at = CASE WHEN campaign.status = 'completed' THEN statement_timestamp() ELSE campaign.consent_confirmed_at END,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'pending';
    v_resolution := 'retry';
  END IF;

  v_message := jsonb_build_object(
    'action', 'resolve_talkx_outcome_unknown',
    'recipient_id', p_recipient_id,
    'resolution', v_resolution,
    'note', p_note,
    'new_status', v_new_status,
    'reopened', v_reopened,
    'relaunch_confirmed', v_reopened
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (v_recipient.campaign_id, 'note', v_message::text, v_actor);

  IF v_reopened THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (v_recipient.campaign_id, 'resumed', NULL, v_actor);
  END IF;

  RETURN v_message;
END;
$function$
