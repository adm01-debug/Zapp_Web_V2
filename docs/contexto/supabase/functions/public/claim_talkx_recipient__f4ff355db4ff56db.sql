CREATE OR REPLACE FUNCTION public.claim_talkx_recipient(p_campaign_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS TABLE(recipient_id uuid, contact_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_recipient_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT recipient.id, recipient.contact_id
    FROM public.talkx_recipients AS recipient
    JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.campaign_id = p_campaign_id
      AND recipient.id = p_recipient_id
      AND campaign.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (
          recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp()
          AND recipient.provider_dispatch_started_at IS NULL
        )
      )
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), blocked AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'skipped',
           error_message = 'Contato na lista negra (opt-out)',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM candidate
      LEFT JOIN public.contacts AS contact ON contact.id = candidate.contact_id
     WHERE recipient.id = candidate.id
       AND EXISTS (
         SELECT 1
         FROM public.talkx_blacklist AS blacklist
         WHERE blacklist.removed_at IS NULL
           AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
           AND (
             blacklist.contact_id = candidate.contact_id
             OR (
               NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
               AND contact.id IS NOT NULL
               AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g')
             )
           )
       )
    RETURNING recipient.id
  ), skipped AS (
    -- X026: destinatário pulado pelo claim entra no contador skipped_count.
    UPDATE public.talkx_campaigns AS campaign
       SET skipped_count = campaign.skipped_count + pulados.cnt,
           updated_at = statement_timestamp()
      FROM (SELECT count(*)::integer AS cnt FROM blocked) AS pulados
     WHERE campaign.id = p_campaign_id
       AND pulados.cnt > 0
    RETURNING campaign.id
  ), claimed AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'sending',
           delivery_claim_token = gen_random_uuid(),
           delivery_claimed_at = statement_timestamp(),
           delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
           delivery_claimed_by = p_worker,
           delivery_attempt_count = recipient.delivery_attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE recipient.id = candidate.id
       AND NOT EXISTS (SELECT 1 FROM blocked)
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.contact_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
END;
$function$
