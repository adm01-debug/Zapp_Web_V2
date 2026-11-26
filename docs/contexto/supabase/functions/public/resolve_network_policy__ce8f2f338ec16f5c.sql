CREATE OR REPLACE FUNCTION public.resolve_network_policy(p_ip text, p_country_code text, p_city text DEFAULT NULL::text, p_endpoint text DEFAULT NULL::text, p_default_max_requests integer DEFAULT NULL::integer, p_default_window_seconds integer DEFAULT NULL::integer)
 RETURNS TABLE(allowed boolean, reason text, rate_limit_max_requests integer, rate_limit_window_seconds integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_geo_mode text;
  v_city_enabled boolean;
  v_country text;
  v_city_key text;
  v_ip_whitelisted boolean;
  v_ip_blocked boolean;
  v_max integer;
  v_window integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'resolve_network_policy: p_ip obrigatorio' using errcode = '22023';
  end if;
  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'resolve_network_policy: p_endpoint obrigatorio' using errcode = '22023';
  end if;
  if p_default_max_requests is null or p_default_max_requests < 1 then
    raise exception 'resolve_network_policy: p_default_max_requests invalido' using errcode = '22023';
  end if;
  if p_default_window_seconds is null or p_default_window_seconds < 1 then
    raise exception 'resolve_network_policy: p_default_window_seconds invalido' using errcode = '22023';
  end if;

  v_country := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_city_key := public.normalize_city_name(p_city);

  -- --- Resolução de rate limit (configurável) ----------------------------
  select rc.max_requests, rc.window_seconds
    into v_max, v_window
    from public.rate_limit_configs rc
   where rc.is_active
     and (
       rc.endpoint_pattern = p_endpoint
       or p_endpoint like
         replace(replace(replace(replace(rc.endpoint_pattern, '\', '\\'), '%', '\%'), '_', '\_'), '*', '%')
         escape '\'
     )
   order by
     (rc.endpoint_pattern = p_endpoint) desc,
     length(rc.endpoint_pattern) desc,
     rc.updated_at desc nulls last,
     rc.id asc
   limit 1;

  if v_max is null then
    v_max := p_default_max_requests;
    v_window := p_default_window_seconds;
  end if;

  -- --- 1) Política de IP -------------------------------------------------
  select exists (select 1 from public.ip_whitelist where ip_address = p_ip)
    into v_ip_whitelisted;

  if not v_ip_whitelisted then
    select exists (
      select 1 from public.blocked_ips
      where ip_address = p_ip
        and (expires_at is null or expires_at > now())
    ) into v_ip_blocked;

    if v_ip_blocked then
      return query select false, 'ip_blocked'::text, v_max, v_window;
      return;
    end if;
  end if;

  -- --- 2) Política de país (sempre aplicada, mesmo com IP whitelisted) ---
  -- Modo de país e toggle de cidade saem da MESMA linha de configuração.
  select s.mode, s.city_whitelist_enabled into v_geo_mode, v_city_enabled
    from public.geo_blocking_settings s
   order by s.updated_at desc nulls last, s.created_at desc nulls last, s.id asc
   limit 1;

  if v_geo_mode is null or v_geo_mode = 'disabled' then
    null;
  elsif v_geo_mode = 'whitelist' then
    if v_country is null or not exists (
      select 1 from public.allowed_countries where country_code = v_country
    ) then
      return query select false, 'country_blocked'::text, v_max, v_window;
      return;
    end if;
  elsif v_geo_mode = 'blacklist' then
    if v_country is null or exists (
      select 1 from public.blocked_countries where country_code = v_country
    ) then
      return query select false, 'country_blocked'::text, v_max, v_window;
      return;
    end if;
  else
    return query select false, 'country_blocked'::text, v_max, v_window;
    return;
  end if;

  -- --- 3) Política de cidade (sempre aplicada, mesmo com IP whitelisted) --
  -- Só atua com o toggle ligado. Ligado: cidade ausente, fora da lista, inativa ou
  -- lista vazia => nega (falha fechada).
  if coalesce(v_city_enabled, false) then
    if v_city_key is null or not exists (
      select 1 from public.city_whitelist w
       where w.city_key = v_city_key and w.is_active
    ) then
      return query select false, 'city_blocked'::text, v_max, v_window;
      return;
    end if;
  end if;

  return query select true, null::text, v_max, v_window;
end;
$function$
