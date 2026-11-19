CREATE OR REPLACE FUNCTION public.enqueue_ai_job(p_idempotency_key text, p_kind text, p_function_name text, p_user_id uuid, p_payload jsonb, p_priority integer DEFAULT 100, p_available_at timestamp with time zone DEFAULT now(), p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_max_attempts integer DEFAULT 8)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_ai_job_idempotency_key' using errcode = '22023';
  end if;
  if p_kind is null or btrim(p_kind) = '' then
    raise exception 'invalid_ai_job_kind' using errcode = '22023';
  end if;
  if p_function_name is null or btrim(p_function_name) = '' then
    raise exception 'invalid_ai_job_function_name' using errcode = '22023';
  end if;
  if p_priority is null or p_priority not between 0 and 1000 then
    raise exception 'invalid_ai_job_priority' using errcode = '22023';
  end if;
  if p_max_attempts is null or p_max_attempts not between 1 and 50 then
    raise exception 'invalid_ai_job_max_attempts' using errcode = '22023';
  end if;

  insert into public.ai_jobs
    (idempotency_key, kind, function_name, user_id, payload,
     priority, available_at, expires_at, max_attempts, status)
  values
    (p_idempotency_key, p_kind, p_function_name, p_user_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_priority, 100), coalesce(p_available_at, now()), p_expires_at,
     coalesce(p_max_attempts, 8), 'queued')
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select job.id into v_id
      from public.ai_jobs as job
     where job.idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$function$
