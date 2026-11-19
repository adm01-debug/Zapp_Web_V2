CREATE OR REPLACE FUNCTION public.resolve_network_policy(p_ip text, p_country_code text, p_endpoint text, p_default_max_requests integer, p_default_window_seconds integer)
 RETURNS TABLE(allowed boolean, reason text, rate_limit_max_requests integer, rate_limit_window_seconds integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_geo_mode text;
  v_country text;
  v_ip_whitelisted boolean;
  v_ip_blocked boolean;
  v_max integer;
  v_window integer;
begin
  -- Validação de entradas (impossível decidir → exceção; o chamador converte em 503).
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

  -- País normalizado (maiúsculo, trim); vazio vira ausente (NULL).
  v_country := nullif(upper(btrim(coalesce(p_country_code, ''))), '');

  -- --- Resolução de rate limit (configurável) ----------------------------
  -- Regra ativa que casa (exato ou padrão com '*') prevalece; empates determinísticos.
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

  -- Sem regra: preserva os parâmetros do chamador.
  if v_max is null then
    v_max := p_default_max_requests;
    v_window := p_default_window_seconds;
  end if;

  -- --- 1) Política de IP -------------------------------------------------
  -- Whitelist isenta SOMENTE o bloqueio por IP (não autenticação, país nem rate limit).
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
  select s.mode into v_geo_mode
    from public.geo_blocking_settings s
   order by s.updated_at desc nulls last, s.created_at desc nulls last, s.id asc
   limit 1;

  if v_geo_mode is null or v_geo_mode = 'disabled' then
    null; -- permite
  elsif v_geo_mode = 'whitelist' then
    -- whitelist vazia ou país ausente nega todos (falha fechada)
    if v_country is null or not exists (
      select 1 from public.allowed_countries where country_code = v_country
    ) then
      return query select false, 'country_blocked'::text, v_max, v_window;
      return;
    end if;
  elsif v_geo_mode = 'blacklist' then
    -- país ausente falha fechado; listado nega; fora da lista permite
    if v_country is null or exists (
      select 1 from public.blocked_countries where country_code = v_country
    ) then
      return query select false, 'country_blocked'::text, v_max, v_window;
      return;
    end if;
  else
    -- modo desconhecido: falha fechada
    return query select false, 'country_blocked'::text, v_max, v_window;
    return;
  end if;

  return query select true, null::text, v_max, v_window;
end;
$function$
