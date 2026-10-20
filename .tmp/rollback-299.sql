CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id  uuid,
  p_action       text,
  p_pause_reason text DEFAULT NULL,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_next_status text;
  v_event_type  text;
  v_event_msg   text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_transition' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  CASE p_action
    WHEN 'start' THEN
      IF v_campaign.status = 'sending' THEN
        -- X010: retomada idempotente — já enviando, a transição é no-op e NÃO toca
        -- em started_at (o UPDATE abaixo nem chega a rodar).
        RETURN QUERY SELECT p_campaign_id, 'sending', 'sending';
        RETURN;
      END IF;
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_start_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      -- X032: iniciar exige a confirmacao de consentimento/base legal gravada.
      IF v_campaign.consent_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'talkx_campaign_consent_required' USING ERRCODE = '22023';
      END IF;
      IF btrim(COALESCE(v_campaign.message_template, '')) = '' THEN
        RAISE EXCEPTION 'talkx_campaign_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_campaign.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.talkx_recipients AS recipient
           WHERE recipient.campaign_id = p_campaign_id
         ) THEN
        RAISE EXCEPTION 'talkx_campaign_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
      -- X024: retomada distinta — com ator é 'resumed', sem ator (worker/cron) é 'resumed_auto'.
      v_event_type := CASE
        WHEN v_campaign.status = 'paused' THEN
          CASE WHEN p_actor_id IS NULL THEN 'resumed_auto' ELSE 'resumed' END
        ELSE 'started'
      END;
      v_event_msg := NULL;
    WHEN 'pause' THEN
      IF v_campaign.status <> 'sending' THEN
        RAISE EXCEPTION 'talkx_campaign_pause_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
      v_event_type := 'paused';
      v_event_msg := p_pause_reason;
    WHEN 'cancel' THEN
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_cancel_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
      v_event_type := 'cancelled';
      v_event_msg := NULL;
      -- V14 + X024: fecha a fila — pendentes e em voo viram cancelled; leases são soltas
      -- sem dispatch (delivery_claim_* = NULL respeita o CHECK talkx_recipients_delivery_claim_state).
      UPDATE public.talkx_recipients AS recipient
      SET status = 'cancelled',
          delivery_claim_token = NULL,
          delivery_claimed_at = NULL,
          delivery_claim_expires_at = NULL,
          delivery_claimed_by = NULL,
          updated_at = statement_timestamp()
      WHERE recipient.campaign_id = p_campaign_id
        AND recipient.status IN ('pending', 'sending');
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      launched_by  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_by, p_actor_id)
        ELSE campaign.launched_by END,
      launched_at  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_at, statement_timestamp())
        ELSE campaign.launched_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      paused_by    = CASE
        WHEN p_action = 'pause' THEN p_actor_id
        WHEN p_action = 'start' THEN NULL
        ELSE campaign.paused_by END,
      cancelled_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE campaign.cancelled_at END,
      cancelled_by = CASE WHEN p_action = 'cancel' THEN p_actor_id ELSE campaign.cancelled_by END,
      -- X024: cancelar solta a trava do worker — nenhum worker continua a campanha.
      worker_id    = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_id END,
      worker_lease_expires_at = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_lease_expires_at END,
      updated_at   = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, v_event_type, v_event_msg, p_actor_id);

  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid) IS
  'Talk X (X024 + X032): transicoes start/pause/cancel com evento, ator e motivo. X032: start recusa campanha sem consent_confirmed_at (talkx_campaign_consent_required).';
