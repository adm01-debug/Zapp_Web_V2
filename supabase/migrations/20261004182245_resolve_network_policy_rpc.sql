-- resolve_network_policy_rpc
-- Rollback: DROP FUNCTION IF EXISTS public.resolve_network_policy(text, text, text, integer, integer);

-- ============================================================================
-- R2-AUTH-022 / item 27.1 — fronteira canônica de decisão de política de rede.
--
-- O defeito: a UI administrativa persiste geo_blocking_settings, allowed_countries,
-- blocked_countries, blocked_ips, ip_whitelist e rate_limit_configs, mas a cadeia de
-- acesso (login e Edges autenticadas via requireAuth) NUNCA lê essas tabelas — os
-- helpers is_ip_blocked/is_ip_whitelisted/is_country_allowed/is_country_blocked
-- existem sem consumidor e enforceRateLimit envia máximos hardcoded.
--
-- Esta migration nasce o CONSUMIDOR canônico: uma RPC SECURITY DEFINER que decide,
-- em UMA chamada, (1) política de IP, (2) política de país e (3) o rate limit
-- efetivo (configurável). Os cartões 27.2 (módulo compartilhado), 27.3 (requireAuth)
-- e 27.4 (auth-login) consomem esta fronteira — este arquivo não toca Edge/UI.
--
-- Semântica fixada pelo coordenador (decisão 2026-10-04-r2-auth-022-decomposicao.md):
--   * Escopo: requisições interativas de usuários (login + Edges com requireAuth);
--     webhooks/cron internos ficam fora (não chamam esta RPC).
--   * IP: whitelist isenta SOMENTE o bloqueio por IP (não isenta autenticação, país
--     nem rate limit); IP explicitamente bloqueado (e não whitelisted) nega.
--   * País: fonte é parâmetro normalizado entregue pela Edge (ISO alpha-2); o banco
--     NÃO geolocaliza IP. mode 'disabled' permite; 'blacklist' nega os listados;
--     'whitelist' permite apenas os listados (whitelist vazia nega todos); país
--     ausente em modo ativo falha fechado.
--   * Rate limit: regra is_active de rate_limit_configs prevalece sobre os máximos do
--     chamador quando endpoint_pattern casa com o identificador canônico do endpoint;
--     sem regra, preserva os parâmetros do chamador. Empates determinísticos (abaixo).
--
-- Contrato de retorno (respostas não revelam regras/listas — só a categoria):
--   allowed=false, reason='ip_blocked'        → IP bloqueado (não whitelisted);
--   allowed=false, reason='country_blocked'   → país negado/ausente em modo ativo;
--   allowed=true,  reason=NULL                → permitido; rate_limit_* é o limite efetivo.
--   Entrada inválida (p_ip/p_endpoint vazios, defaults < 1) → EXCEPTION (chamador → 503).
--
-- Empate de rate limit (determinístico, nesta ordem):
--   (1) match exato (endpoint_pattern = p_endpoint) antes de padrão com '*';
--   (2) endpoint_pattern mais longo (mais específico) primeiro;
--   (3) updated_at mais recente; (4) id (uuid) crescente como desempate final.
--   Padrão: '*' vira '%' (LIKE), com % _ \ escapados; 'ESCAPE '\''.
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
$$;

revoke all on function public.resolve_network_policy(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.resolve_network_policy(text, text, text, integer, integer) to service_role;

comment on function public.resolve_network_policy(text, text, text, integer, integer) is
  'R2-AUTH-022 (27.1): fronteira canônica de decisão de política de rede. Decide IP (whitelist isenta só bloqueio), país (geo_blocking_settings, falha fechada) e rate limit efetivo (rate_limit_configs ativo prevalece; senão, parâmetros do chamador). Chamada por Edge Functions com service_role.';
