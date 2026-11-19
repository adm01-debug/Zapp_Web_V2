CREATE OR REPLACE FUNCTION public.claim_multiplix_recipient(p_dispatch_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS TABLE(recipient_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_recipient_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT recipient.id, recipient.company_id
    FROM public.multiplix_recipients AS recipient
    JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
    WHERE recipient.dispatch_id = p_dispatch_id
      AND recipient.id = p_recipient_id
      AND dispatch.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (
          recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp()
          AND recipient.provider_dispatch_started_at IS NULL
        )
      )
      -- Item em backoff nao volta para nenhum worker antes da hora: sem isto um
      -- segundo worker pega o item e o destinatario recebe duas mensagens.
      AND (recipient.retry_after IS NULL OR recipient.retry_after <= statement_timestamp())
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.multiplix_recipients AS recipient
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
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.company_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
END;
$function$
