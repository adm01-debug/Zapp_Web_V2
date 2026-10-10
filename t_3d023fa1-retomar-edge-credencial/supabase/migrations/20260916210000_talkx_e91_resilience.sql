-- E91 · Resiliência: retry com backoff, auto-pausa por conexão perdida

-- Colunas de retry nos destinatários
ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_after   timestamptz;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_retry
  ON public.talkx_recipients(campaign_id, retry_after)
  WHERE status = 'pending' AND retry_after IS NOT NULL;

-- Coluna de motivo de pausa nas campanhas
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS pause_reason text;

-- transition_talkx_campaign aceita p_pause_reason opcional
CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id uuid,
  p_action      text,
  p_pause_reason text DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_next_status text;
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
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_start_denied_from_%', v_campaign.status USING ERRCODE = '55000';
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
    WHEN 'pause' THEN
      IF v_campaign.status <> 'sending' THEN
        RAISE EXCEPTION 'talkx_campaign_pause_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
    WHEN 'cancel' THEN
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_cancel_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      updated_at   = statement_timestamp()
  WHERE campaign.id = p_campaign_id;
  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;

-- RPC atômica de reagendamento com backoff
CREATE OR REPLACE FUNCTION public.reschedule_talkx_recipient(
  p_recipient_id uuid,
  p_claim_token  uuid,
  p_retry_after  timestamptz,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt  integer;
  v_campaign uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.talkx_recipients
  SET attempt_count          = attempt_count + 1,
      retry_after            = p_retry_after,
      error_message          = NULLIF(btrim(COALESCE(p_error_message, '')), ''),
      status                 = 'pending',
      delivery_claim_token   = NULL,
      delivery_claimed_at    = NULL,
      delivery_claim_expires_at = NULL,
      delivery_claimed_by    = NULL,
      delivery_last_claim_token = p_claim_token,
      updated_at             = statement_timestamp()
  WHERE id                   = p_recipient_id
    AND status               = 'sending'
    AND delivery_claim_token = p_claim_token
  RETURNING attempt_count, campaign_id
  INTO v_attempt, v_campaign;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt >= 3 THEN
    UPDATE public.talkx_recipients
    SET status = 'failed', retry_after = NULL, updated_at = statement_timestamp()
    WHERE id = p_recipient_id;
    UPDATE public.talkx_campaigns
    SET failed_count = failed_count + 1, updated_at = statement_timestamp()
    WHERE id = v_campaign;
    RETURN jsonb_build_object('action', 'dead_lettered', 'attempt', v_attempt);
  END IF;
  RETURN jsonb_build_object('action', 'rescheduled', 'attempt', v_attempt, 'retry_after', p_retry_after);
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_talkx_recipient(uuid, uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_talkx_recipient(uuid, uuid, timestamptz, text) TO service_role;
