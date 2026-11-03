CREATE OR REPLACE FUNCTION public.talkx_next_recipients(p_campaign_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(recipient_id uuid, contact_id uuid, status text, attempt_count integer, retry_after timestamp with time zone, personalized_message text, contact_name text, contact_nickname text, contact_phone text, contact_company text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT recipient.id,
         recipient.contact_id,
         recipient.status,
         recipient.attempt_count,
         recipient.retry_after,
         recipient.personalized_message,
         contact.name,
         contact.nickname,
         contact.phone,
         contact.company
  FROM public.talkx_recipients AS recipient
  JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
  LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
  WHERE recipient.campaign_id = p_campaign_id
    AND campaign.status = 'sending'
    AND recipient.provider_dispatch_started_at IS NULL
    AND (
      (
        recipient.status = 'pending'
        AND (recipient.retry_after IS NULL OR recipient.retry_after <= v_now)
      )
      OR
      (
        recipient.status = 'sending'
        AND recipient.delivery_claim_expires_at IS NOT NULL
        AND recipient.delivery_claim_expires_at <= v_now
      )
    )
  ORDER BY recipient.created_at, recipient.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
END;
$function$
