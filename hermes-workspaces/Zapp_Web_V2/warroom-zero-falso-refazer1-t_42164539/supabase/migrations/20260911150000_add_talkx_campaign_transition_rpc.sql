-- Talk X: all delivery state transitions take the same row lock.  This closes
-- start/pause/cancel races between concurrent Edge Function invocations.

CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id uuid,
  p_action text
)
RETURNS TABLE (
  campaign_id uuid,
  previous_status text,
  current_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
           SELECT 1
           FROM public.talkx_recipients AS recipient
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
  SET status = v_next_status,
      started_at = CASE
        WHEN p_action = 'start' THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at
      END,
      paused_at = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      updated_at = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_talkx_campaign(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text) TO service_role;
