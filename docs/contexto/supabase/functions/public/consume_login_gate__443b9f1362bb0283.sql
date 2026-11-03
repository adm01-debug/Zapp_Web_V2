CREATE OR REPLACE FUNCTION public.consume_login_gate(p_email text, p_ip text, p_ip_max integer, p_ip_window_seconds integer, p_email_max integer, p_email_window_seconds integer)
 RETURNS TABLE(allowed boolean, is_locked boolean, locked_until timestamp with time zone, attempts integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempts integer;
  v_locked_until timestamp with time zone;
  v_allowed boolean;
  v_remaining integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'consume_login_gate: p_ip obrigatorio' using errcode = '22023';
  end if;
  if p_ip_max is null or p_ip_max < 1 then
    raise exception 'consume_login_gate: p_ip_max invalido' using errcode = '22023';
  end if;
  if p_ip_window_seconds is null or p_ip_window_seconds < 1 then
    raise exception 'consume_login_gate: p_ip_window_seconds invalido' using errcode = '22023';
  end if;
  if p_email is not null and (p_email_max is null or p_email_max < 1) then
    raise exception 'consume_login_gate: p_email_max invalido' using errcode = '22023';
  end if;
  if p_email is not null and (p_email_window_seconds is null or p_email_window_seconds < 1) then
    raise exception 'consume_login_gate: p_email_window_seconds invalido' using errcode = '22023';
  end if;

  if p_email is not null then
    select la.attempt_count, la.locked_until
      into v_attempts, v_locked_until
      from public.login_attempts la
     where la.email = lower(p_email);

    if v_locked_until is not null and v_locked_until > now() then
      return query select false, true, v_locked_until, v_attempts, 0;
      return;
    end if;
  end if;
  v_attempts := coalesce(v_attempts, 0);

  select c.allowed, c.remaining
    into v_allowed, v_remaining
    from public.consume_rate_limit('auth-login:' || p_ip, p_ip_max, p_ip_window_seconds) c;
  if v_allowed is null then
    raise exception 'consume_login_gate: consume_rate_limit nao retornou linha' using errcode = 'XX000';
  end if;
  if not v_allowed then
    return query select false, false, null::timestamp with time zone, v_attempts, v_remaining;
    return;
  end if;

  if p_email is null then
    return query select true, false, null::timestamp with time zone, 0, v_remaining;
    return;
  end if;

  select c.allowed, c.remaining
    into v_allowed, v_remaining
    from public.consume_rate_limit('auth-login-email:' || lower(p_email), p_email_max, p_email_window_seconds) c;
  if v_allowed is null then
    raise exception 'consume_login_gate: consume_rate_limit nao retornou linha' using errcode = 'XX000';
  end if;

  return query select v_allowed, false, null::timestamp with time zone, v_attempts, v_remaining;
end;
$function$
