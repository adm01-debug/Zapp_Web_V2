CREATE OR REPLACE FUNCTION public.sweep_talkx_stuck_recipients(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_swept integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_talkx_sweep_limit' USING ERRCODE = '22023';
  END IF;

  WITH stuck AS (
    SELECT recipient.id, recipient.campaign_id
      FROM public.talkx_recipients AS recipient
     WHERE recipient.status = 'sending'
       AND recipient.delivery_claim_expires_at < statement_timestamp()
       AND recipient.provider_dispatch_started_at IS NOT NULL
     ORDER BY recipient.delivery_claim_expires_at
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  ), swept AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE recipient.id = stuck.id
    RETURNING recipient.campaign_id
  ), counted AS (
    SELECT swept.campaign_id, count(*) AS n FROM swept GROUP BY swept.campaign_id
  ), bumped AS (
    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = campaign.outcome_unknown_count + counted.n,
           updated_at = statement_timestamp()
      FROM counted
     WHERE campaign.id = counted.campaign_id
    RETURNING campaign.id
  )
  SELECT COALESCE(sum(counted.n), 0) INTO v_swept FROM counted;

  RETURN v_swept;
END;
$function$
