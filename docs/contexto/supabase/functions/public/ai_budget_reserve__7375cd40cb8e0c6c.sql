CREATE OR REPLACE FUNCTION public.ai_budget_reserve(p_idempotency_key text, p_user_id uuid, p_function_name text, p_estimated_tokens integer, p_limit_tokens integer, p_ttl_ms integer)
 RETURNS TABLE(id uuid, allowed boolean, used_tokens integer, limit_tokens integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_used integer;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'ai_budget_reserve: p_idempotency_key obrigatorio' using errcode = '22023';
  end if;
  if p_function_name is null or btrim(p_function_name) = '' then
    raise exception 'ai_budget_reserve: p_function_name obrigatorio' using errcode = '22023';
  end if;
  if p_estimated_tokens is null or p_estimated_tokens < 0 then
    raise exception 'ai_budget_reserve: p_estimated_tokens invalido' using errcode = '22023';
  end if;
  if p_limit_tokens is null or p_limit_tokens < 0 then
    raise exception 'ai_budget_reserve: p_limit_tokens invalido' using errcode = '22023';
  end if;
  if p_ttl_ms is null or p_ttl_ms <= 0 then
    raise exception 'ai_budget_reserve: p_ttl_ms invalido' using errcode = '22023';
  end if;

  -- Serializa TODAS as reservas do mesmo dono dentro desta transacao. Sem isto, duas chamadas
  -- paralelas do mesmo usuario somariam o MESMO estado e ambas inseririam (o furo do count()).
  perform pg_advisory_xact_lock(hashtext(coalesce(p_user_id::text, 'anon')));

  -- Idempotencia: a MESMA chave devolve a MESMA reserva (a IA segue), sem dobrar consumo.
  select r.id into v_id
    from public.ai_budget_reservations as r
   where r.idempotency_key = p_idempotency_key;

  if v_id is not null then
    select coalesce(sum(r.reserved_tokens), 0) into v_used
      from public.ai_budget_reservations as r
     where r.user_id is not distinct from p_user_id
       and r.status = 'reserved'
       and r.expires_at > now();
    return query select v_id, true, v_used, p_limit_tokens;
    return;
  end if;

  -- Soma viva do dono (sob o lock): reservas 'reserved' ainda NAO vencidas.
  select coalesce(sum(r.reserved_tokens), 0) into v_used
    from public.ai_budget_reservations as r
   where r.user_id is not distinct from p_user_id
     and r.status = 'reserved'
     and r.expires_at > now();

  if v_used + p_estimated_tokens <= p_limit_tokens then
    insert into public.ai_budget_reservations as r
      (idempotency_key, user_id, function_name, reserved_tokens, status, expires_at)
    values
      (p_idempotency_key, p_user_id, p_function_name, p_estimated_tokens, 'reserved',
       now() + make_interval(secs => p_ttl_ms::double precision / 1000.0))
    returning r.id into v_id;
    return query select v_id, true, v_used + p_estimated_tokens, p_limit_tokens;
  else
    return query select null::uuid, false, v_used, p_limit_tokens;
  end if;
end;
$function$
