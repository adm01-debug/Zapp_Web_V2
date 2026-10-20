-- Talk X: only a locked, service-role transition may mark a campaign complete.
-- The transition is conditional on every recipient being terminal, so a worker
-- cannot overwrite a concurrent pause/cancel or complete a truncated batch.

CREATE OR REPLACE FUNCTION public.complete_talkx_campaign_if_drained(
  p_campaign_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  SELECT campaign.status
    INTO v_status
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.talkx_recipients AS recipient
     WHERE recipient.campaign_id = p_campaign_id
       AND recipient.status IN ('pending', 'sending')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.talkx_campaigns
     SET status = 'completed',
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id
     AND status = 'sending';

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  TO service_role;
