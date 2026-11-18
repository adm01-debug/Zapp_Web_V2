CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox(p_worker text, p_limit integer DEFAULT 10)
 RETURNS SETOF crm_sync_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Reaper limitado: evita uma única transação atualizar todo o backlog vencido.
  WITH exhausted AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE status = 'processing'
      AND locked_at < now() - interval '5 minutes'
      AND attempt_count >= max_attempts
    ORDER BY locked_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  )
  UPDATE public.crm_sync_outbox q
  SET status = 'dead_letter', locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS', updated_at = now()
  FROM exhausted e WHERE q.id = e.id;

  RETURN QUERY
  WITH ready AS (
    SELECT id, created_at FROM public.crm_sync_outbox
    WHERE status IN ('pending', 'failed') AND available_at <= now()
      AND attempt_count < max_attempts AND normalized_phone IS NOT NULL
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  ), stale AS (
    SELECT id, created_at FROM public.crm_sync_outbox
    WHERE status = 'processing' AND locked_at < now() - interval '5 minutes'
      AND attempt_count < max_attempts AND normalized_phone IS NOT NULL
    ORDER BY locked_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  ), candidates AS (
    SELECT id FROM (SELECT * FROM ready UNION ALL SELECT * FROM stale) queued
    ORDER BY created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  )
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100),
      lease_token = gen_random_uuid(), updated_at = now()
  FROM candidates c WHERE q.id = c.id
  RETURNING q.*;
END;
$function$
