-- resolve_network_policy_geo_nao_derruba
-- Rollback: reaplicar o CREATE OR REPLACE FUNCTION de supabase/migrations/20261004182245_resolve_network_policy_rpc.sql (restaura a semantica anterior, que falha fechada)

-- ============================================================================
-- QA5-08 / cartao t_3abd76ce — a politica de rede nao pode derrubar TODO o login
-- por configuracao incompleta ou falta de sinal.
--
-- O que muda (so o bloco de pais da RPC canonica; IP e rate limit intactos):
--   * modo 'whitelist' com allowed_countries VAZIA: antes negava todos
--     (whitelist vazia falhava fechada). Agora permite e devolve
--     reason='geo_empty_allowlist' — aviso que a Edge registra em log.
--   * pais ausente (p_country_code NULL, ex.: sem header cf-ipcountry) em modo
--     ativo: antes falhava fechado (negava). Agora permite e devolve
--     reason='geo_country_unknown' — pais desconhecido nao e evidencia de
--     violacao; negar seria bloquear usuarios legitimos por falta de sinal da
--     infraestrutura.
--   * whitelist com lista populada continua exigindo o pais listado;
--     blacklist continua negando os listados; modo desconhecido continua
--     falhando fechado ('country_blocked'); bloqueio de IP nao muda.
--
-- Contrato estendido: em linhas allowed=true, reason pode carregar um AVISO
-- ('geo_empty_allowlist' | 'geo_country_unknown') em vez de NULL. O chamador
-- (request-policy.ts) propaga como `notice` para log — nunca para o cliente.
-- ============================================================================

create or replace function public.resolve_network_policy(
  p_ip text,
  p_country_code text,
  p_endpoint text,
  p_default_max_requests integer,
  p_default_window_seconds integer
)
returns table (
  allowed boolean,
  reason text,
  rate_limit_max_requests integer,
  rate_limit_window_seconds integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
  -- QA5-08: modo ativo SEM lista populada ou SEM país conhecido não bloqueia —
  -- permite com aviso (reason em linha allowed=true) para o chamador registrar.
  select s.mode into v_geo_mode
    from public.geo_blocking_settings s
   order by s.updated_at desc nulls last, s.created_at desc nulls last, s.id asc
   limit 1;

  if v_geo_mode is null or v_geo_mode = 'disabled' then
    null; -- permite
  elsif v_geo_mode = 'whitelist' then
    if not exists (select 1 from public.allowed_countries) then
      -- modo ligado sem lista: configuração incompleta, não bloqueia
      return query select true, 'geo_empty_allowlist'::text, v_max, v_window;
      return;
    elsif v_country is null then
      -- sem sinal de país da infraestrutura: não bloqueia, registra
      return query select true, 'geo_country_unknown'::text, v_max, v_window;
      return;
    elsif not exists (
      select 1 from public.allowed_countries where country_code = v_country
    ) then
      return query select false, 'country_blocked'::text, v_max, v_window;
      return;
    end if;
  elsif v_geo_mode = 'blacklist' then
    if v_country is null then
      return query select true, 'geo_country_unknown'::text, v_max, v_window;
      return;
    elsif exists (
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
$$;

revoke all on function public.resolve_network_policy(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.resolve_network_policy(text, text, text, integer, integer) to service_role;

comment on function public.resolve_network_policy(text, text, text, integer, integer) is
  'R2-AUTH-022 (27.1) + QA5-08: fronteira canônica de decisão de política de rede. Decide IP (whitelist isenta só bloqueio), país (geo_blocking_settings; allowlist vazia ou país ausente NÃO bloqueia — devolve aviso geo_empty_allowlist/geo_country_unknown) e rate limit efetivo (rate_limit_configs ativo prevalece; senão, parâmetros do chamador). Chamada por Edge Functions com service_role.';
