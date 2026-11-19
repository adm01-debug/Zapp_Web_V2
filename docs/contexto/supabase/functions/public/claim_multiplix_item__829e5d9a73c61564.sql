CREATE OR REPLACE FUNCTION public.claim_multiplix_item(p_dispatch_id uuid, p_item_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS TABLE(item_id uuid, recipient_id uuid, block_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_item_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT item.id, item.recipient_id, item.block_id, recipient.company_id
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
      JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
     WHERE item.dispatch_id = p_dispatch_id
       AND item.id = p_item_id
       AND dispatch.status = 'sending'
       AND (
         item.status IN ('pending', 'failed_transient')
         OR (
           item.status = 'sending'
           AND item.lease_until <= statement_timestamp()
           AND item.provider_dispatch_started_at IS NULL
         )
       )
       -- Backoff da fila por item: sem isto um segundo worker pega o item antes da
       -- hora e o destinatario recebe o bloco duas vezes (F12 transportado ao item).
       AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= statement_timestamp())
     ORDER BY item.next_attempt_at NULLS FIRST, item.created_at, item.id
     FOR UPDATE OF item SKIP LOCKED
     LIMIT 1
  ), claimed AS (
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'sending',
           lease_token = gen_random_uuid(),
           lease_until = statement_timestamp() + make_interval(secs => p_lease_seconds),
           worker_id = p_worker,
           attempt_count = item.attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE item.id = candidate.id
    RETURNING item.id, item.recipient_id, item.block_id, item.lease_token,
              item.lease_until, item.attempt_count
  )
  SELECT claimed.id, claimed.recipient_id, claimed.block_id, candidate.company_id,
         claimed.lease_token, claimed.lease_until, claimed.attempt_count
  FROM claimed
  JOIN candidate ON candidate.id = claimed.id;
END;
$function$
