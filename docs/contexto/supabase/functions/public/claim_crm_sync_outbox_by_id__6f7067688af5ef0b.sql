CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox_by_id(p_id uuid, p_worker text)
 RETURNS SETOF crm_sync_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'dead_letter', locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS', updated_at = now()
  WHERE id = p_id AND status = 'processing'
    AND locked_at < now() - interval '5 minutes'
    AND attempt_count >= max_attempts;

  RETURN QUERY
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100),
      lease_token = gen_random_uuid(), updated_at = now()
  WHERE q.id = p_id
    AND (
      (q.status IN ('pending', 'failed') AND q.available_at <= now())
      OR (q.status = 'processing' AND q.locked_at < now() - interval '5 minutes')
    )
    AND q.attempt_count < q.max_attempts
    AND q.normalized_phone IS NOT NULL
  RETURNING q.*;
END;
$function$
