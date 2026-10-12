-- city_whitelist_network_policy
-- Rollback: DROP FUNCTION IF EXISTS public.resolve_network_policy(text, text, text, text, integer, integer); DROP TABLE IF EXISTS public.city_whitelist; ALTER TABLE public.geo_blocking_settings DROP COLUMN IF EXISTS city_whitelist_enabled; DROP FUNCTION IF EXISTS public.normalize_city_name(text); -- depois re-aplicar 20261004182245_resolve_network_policy_rpc.sql (CREATE OR REPLACE da assinatura de 5 argumentos)

-- ============================================================================
-- Bloqueio de login por CIDADE (paridade Promo Gifts V4), plugado na MESMA
-- fronteira canônica R2-AUTH-022: public.resolve_network_policy. Não há caminho
-- paralelo de checagem.
--
-- Decisões:
--   * Toggle: coluna `city_whitelist_enabled` em geo_blocking_settings (a linha
--     que a RPC já lê para o modo de país), DEFAULT false — nasce DESLIGADO e o
--     login de hoje não muda até alguém ligar.
--   * Lista: public.city_whitelist (mesmo padrão de ip_whitelist). `city_key` é a
--     chave normalizada (minúsculas, sem acento, espaços colapsados) e é única;
--     a RPC compara por ela, então "São Paulo" == "sao  paulo".
--   * Fonte da cidade: parâmetro entregue pela Edge a partir de header de infra
--     confiável (nenhum lookup geoip no app/banco). Cidade ausente com o toggle
--     ligado FALHA FECHADO, igual ao país. Lista vazia com toggle ligado nega todos.
--   * Semântica: whitelist de IP NÃO isenta cidade (igual ao país). Negação =
--     reason 'city_blocked' (só para log server-side; o cliente recebe 403 genérico).
--   * Toggle e lista são lidos no mesmo statement STABLE (um snapshot): não existe
--     janela em que o toggle esteja ligado e a lista de outro instante. O toggle sai
--     da MESMA linha de geo_blocking_settings escolhida para o modo de país.
--   * Assinatura: p_city entra como 4º argumento e a forma de 5 argumentos é
--     REMOVIDA (um único chamador existia: _shared/request-policy.ts, atualizado
--     junto). Deixar o overload antigo seria um caminho de checagem sem cidade.
-- ============================================================================

-- Normalização única, usada pela coluna gerada e pela RPC (mesma regra nos dois).
create or replace function public.normalize_city_name(p_city text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(
    btrim(regexp_replace(
      translate(
        lower(coalesce(p_city, '')),
        'áàâãäåāăąçćčďéèêëēěęíìîïīłñńňóòôõöøōőŕřśšşťúùûüūůűýÿźžż',
        'aaaaaaaaacccdeeeeeeeiiiiilnnnooooooooorrssstuuuuuuuyyzzz'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  )
$$;

alter table public.geo_blocking_settings
  add column if not exists city_whitelist_enabled boolean not null default false;

create table if not exists public.city_whitelist (
  id uuid primary key default gen_random_uuid(),
  city_name text not null check (btrim(city_name) <> '' and char_length(city_name) <= 128),
  city_key text generated always as (public.normalize_city_name(city_name)) stored,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint city_whitelist_city_key_not_empty check (city_key is not null),
  constraint city_whitelist_city_key_key unique (city_key)
);

alter table public.city_whitelist enable row level security;

drop policy if exists "Admins can manage city whitelist" on public.city_whitelist;
create policy "Admins can manage city whitelist" on public.city_whitelist
  for all to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()));

revoke all on table public.city_whitelist from public, anon;
grant select, insert, update, delete on table public.city_whitelist to authenticated;
grant all on table public.city_whitelist to service_role;

-- Forma antiga (5 argumentos) sai; a nova carrega p_city.
drop function if exists public.resolve_network_policy(text, text, text, integer, integer);

create or replace function public.resolve_network_policy(
  p_ip text,
  p_country_code text,
  p_city text,
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
$$;

revoke all on function public.resolve_network_policy(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.resolve_network_policy(text, text, text, text, integer, integer) to service_role;

comment on function public.resolve_network_policy(text, text, text, text, integer, integer) is
  'R2-AUTH-022 (27.1) + cidade: fronteira canônica de decisão de política de rede. Decide IP (whitelist isenta só bloqueio), país (geo_blocking_settings, falha fechada), cidade (city_whitelist_enabled + city_whitelist, falha fechada, nasce desligado) e rate limit efetivo. Chamada por Edge Functions com service_role.';
