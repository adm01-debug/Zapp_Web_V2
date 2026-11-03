CREATE OR REPLACE FUNCTION public.reschedule_talkx_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
