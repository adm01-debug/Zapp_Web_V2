-- network_policy_cidr_ipv6
-- Rollback: derruba as duas CHECKs de formato, recria public.resolve_network_policy com o corpo anterior (abaixo), derruba os helpers ip_entry_matches e is_valid_ip_or_cidr (nesta ordem). O UPDATE de saneamento so retira espacos em volta de IP valido (idempotente e semanticamente neutro: o valor logico nao muda, nao ha inverso). Nada e apagado.
-- Rollback (SQL executável, na ordem):
--   alter table public.ip_whitelist drop constraint if exists ip_whitelist_ip_address_valid;
--   alter table public.blocked_ips drop constraint if exists blocked_ips_ip_address_valid;
--   create or replace function public.resolve_network_policy( p_ip text, p_country_code text, p_endpoint text, p_default_max_requests integer, p_default_window_seconds integer ) returns table ( allowed boolean, reason text, rate_limit_max_requests integer, rate_limit_window_seconds integer ) language plpgsql stable security definer set search_path = public as $$ declare v_geo_mode text; v_country text; v_ip_whitelisted boolean; v_ip_blocked boolean; v_max integer; v_window integer; begin if p_ip is null or btrim(p_ip) = '' then raise exception 'resolve_network_policy: p_ip obrigatorio' using errcode = '22023'; end if; if p_endpoint is null or btrim(p_endpoint) = '' then raise exception 'resolve_network_policy: p_endpoint obrigatorio' using errcode = '22023'; end if; if p_default_max_requests is null or p_default_max_requests < 1 then raise exception 'resolve_network_policy: p_default_max_requests invalido' using errcode = '22023'; end if; if p_default_window_seconds is null or p_default_window_seconds < 1 then raise exception 'resolve_network_policy: p_default_window_seconds invalido' using errcode = '22023'; end if; v_country := nullif(upper(btrim(coalesce(p_country_code, ''))), ''); select rc.max_requests, rc.window_seconds into v_max, v_window from public.rate_limit_configs rc where rc.is_active and ( rc.endpoint_pattern = p_endpoint or p_endpoint like replace(replace(replace(replace(rc.endpoint_pattern, '\', '\\'), '%', '\%'), '_', '\_'), '*', '%') escape '\' ) order by (rc.endpoint_pattern = p_endpoint) desc, length(rc.endpoint_pattern) desc, rc.updated_at desc nulls last, rc.id asc limit 1; if v_max is null then v_max := p_default_max_requests; v_window := p_default_window_seconds; end if; select exists (select 1 from public.ip_whitelist where ip_address = p_ip) into v_ip_whitelisted; if not v_ip_whitelisted then select exists ( select 1 from public.blocked_ips where ip_address = p_ip and (expires_at is null or expires_at > now()) ) into v_ip_blocked; if v_ip_blocked then return query select false, 'ip_blocked'::text, v_max, v_window; return; end if; end if; select s.mode into v_geo_mode from public.geo_blocking_settings s order by s.updated_at desc nulls last, s.created_at desc nulls last, s.id asc limit 1; if v_geo_mode is null or v_geo_mode = 'disabled' then null; elsif v_geo_mode = 'whitelist' then if v_country is null or not exists ( select 1 from public.allowed_countries where country_code = v_country ) then return query select false, 'country_blocked'::text, v_max, v_window; return; end if; elsif v_geo_mode = 'blacklist' then if v_country is null or exists ( select 1 from public.blocked_countries where country_code = v_country ) then return query select false, 'country_blocked'::text, v_max, v_window; return; end if; else return query select false, 'country_blocked'::text, v_max, v_window; return; end if; return query select true, null::text, v_max, v_window; end; $$;
--   drop function if exists public.ip_entry_matches(text, inet);
--   drop function if exists public.is_valid_ip_or_cidr(text);
--
-- ============================================================================
-- t_5f5b2ce6 (coordenado com PD-09 / t_860cdff6, que mexeu nas policies das
-- mesmas tabelas). ACHADO: IPWhitelistPanel aceita a.b.c.d/nn, mas
-- resolve_network_policy (20261004182245_resolve_network_policy_rpc.sql:114,120)
-- comparava ip_address = p_ip com a coluna TEXT — uma entrada '10.0.0.0/24'
-- nunca casava: o admin julgava ter liberado/bloqueado a faixa e nada acontecia.
-- A tabela tambem nao validava o texto gravado.
--
-- CORRECAO, aditiva e sem DROP/DELETE de dado:
-- 1. public.ip_entry_matches(p_entry text, p_ip inet): casa a entrada da lista
-- (IP exato OU faixa CIDR — IPv4 e IPv6) contra o IP da requisicao. Cast
-- protegido: texto invalido nunca lanca (apenas nao casa) e familias
-- diferentes nunca se contem.
-- 2. public.resolve_network_policy redefinida com a MESMA assinatura e a MESMA
-- precedencia (whitelist isenta SOMENTE o bloqueio por IP; depois pais; rate
-- limit igual). So a comparacao de IP mudou: as duas listas passam pelo
-- helper. IP de entrada ilegivel nao casa com lista nenhuma (o texto exato
-- de antes tambem nao casava) — nao ha novo caminho de excecao nem oraculo.
-- 3. CHECK public.is_valid_ip_or_cidr em ip_whitelist.ip_address e
-- blocked_ips.ip_address: gravacao invalida recusada (SQLSTATE 23514).
-- Add CONSTRAINT ... NOT VALID: nao trava linha legada e NAO apaga nada.
-- Saneamento por UPDATE: so retira espacos em volta de IP valido, com
-- guarda NOT EXISTS contra a UNIQUE (sem colisao).
-- ============================================================================

-- Helper de leitura: casa entrada da lista (host ou CIDR, IPv4/IPv6) com o IP.
create or replace function public.ip_entry_matches(p_entry text, p_ip inet)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_entry inet;
begin
  if p_entry is null or btrim(p_entry) = '' or p_ip is null then
    return false;
  end if;
  begin
    v_entry := btrim(p_entry)::inet;
  exception when others then
    return false; -- texto legado invalido nunca casa (nao vira erro nem oraculo)
  end;
  if family(v_entry) <> family(p_ip) then
    return false; -- familias diferentes nunca se contem
  end if;
  return p_ip <<= v_entry; -- p_ip contido na faixa (ou igual, quando /32 e /128)
end;
$$;

revoke all on function public.ip_entry_matches(text, inet) from public, anon, authenticated;
grant execute on function public.ip_entry_matches(text, inet) to service_role;

-- Validador de formato (para as CHECK; IMMUTABLE, cast com a excecao engolida).
create or replace function public.is_valid_ip_or_cidr(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return false;
  end if;
  perform btrim(p_value)::inet;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_ip_or_cidr(text) from public, anon, authenticated;
grant execute on function public.is_valid_ip_or_cidr(text) to service_role;

-- Redefinicao: mesma assinatura, mesma semantica; so a comparacao de IP muda.
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
  v_ip inet;
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

  -- IP da requisição parseado UMA vez, protegido: texto ilegível não casa com
  -- lista nenhuma (por igualdade de texto o de antes também não casava), então
  -- não nasce exceção nova nem oráculo de erro.
  begin
    v_ip := btrim(p_ip)::inet;
  exception when others then
    v_ip := null;
  end;

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

  -- --- 1) Política de IP (host exato ou faixa CIDR, IPv4/IPv6) -----------
  -- Whitelist isenta SOMENTE o bloqueio por IP (não autenticação, país nem rate limit).
  -- ip_entry_matches devolve false para v_ip NULL (entrada ilegível) e para família diferente.
  select exists (
    select 1 from public.ip_whitelist w
     where public.ip_entry_matches(w.ip_address, v_ip)
  ) into v_ip_whitelisted;

  if not v_ip_whitelisted then
    select exists (
      select 1 from public.blocked_ips b
       where public.ip_entry_matches(b.ip_address, v_ip)
         and (b.expires_at is null or b.expires_at > now())
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
  'R2-AUTH-022 (27.1/t_5f5b2ce6): fronteira canônica de decisão de política de rede. IP da whitelist/bloqueio casa por host exato OU faixa CIDR (IPv4/IPv6) via ip_entry_matches; whitelist isenta só o bloqueio por IP; país (geo_blocking_settings, falha fechada); rate limit efetivo (rate_limit_configs ativo prevalece; senão, parâmetros do chamador). Chamada por Edge Functions com service_role.';

-- Saneamento NAO destrutivo: so tira espacos em volta de IP valido, sem apagar
-- nada e sem colidir com a UNIQUE (guarda NOT EXISTS).
update public.ip_whitelist w
   set ip_address = btrim(w.ip_address)
 where w.ip_address <> btrim(w.ip_address)
   and public.is_valid_ip_or_cidr(btrim(w.ip_address))
   and not exists (select 1 from public.ip_whitelist x
                    where x.ip_address = btrim(w.ip_address) and x.id <> w.id);

update public.blocked_ips b
   set ip_address = btrim(b.ip_address)
 where b.ip_address <> btrim(b.ip_address)
   and public.is_valid_ip_or_cidr(btrim(b.ip_address))
   and not exists (select 1 from public.blocked_ips x
                    where x.ip_address = btrim(b.ip_address) and x.id <> b.id);

-- Relata (NOTICE no apply) o que ficou invalido e NAO e apagado.
do $$
declare v_w integer; v_b integer;
begin
  select count(*) into v_w from public.ip_whitelist where not public.is_valid_ip_or_cidr(ip_address);
  select count(*) into v_b from public.blocked_ips   where not public.is_valid_ip_or_cidr(ip_address);
  raise notice 'network_policy_cidr: invalidos remanescentes (nao apagados) ip_whitelist=%, blocked_ips=%', v_w, v_b;
end $$;

-- Restricao de formato na gravacao das duas tabelas. NOT VALID: nao trava linha
-- legada; a aplicacao NAO valida retroativamente (dado antigo preservado).
alter table public.ip_whitelist drop constraint if exists ip_whitelist_ip_address_valid;
alter table public.ip_whitelist
  add constraint ip_whitelist_ip_address_valid
  check (public.is_valid_ip_or_cidr(ip_address)) not valid;

alter table public.blocked_ips drop constraint if exists blocked_ips_ip_address_valid;
alter table public.blocked_ips
  add constraint blocked_ips_ip_address_valid
  check (public.is_valid_ip_or_cidr(ip_address)) not valid;
