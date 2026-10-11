-- admin_login_attempts_rpc
-- Rollback: dropa as duas RPCs de leitura do painel de auth; nada mais muda (a tabela public.login_attempts e as policies dela ja existiam e ficam intactas).
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_login_attempts(text, text, boolean, integer);
--   drop function if exists public.admin_blocked_accounts();
--
-- PARIDADE V3 -> V2 (auditoria de frontend, 11/10/2026):
-- o painel admin do V3 listava as tentativas de login falhas
-- (AdminFailedAuthMessagesPage). No V2 nao havia caminho de leitura: o painel ou lia a
-- tabela public.login_attempts direto (dependendo so da RLS) ou nao tinha como listar.
-- Esta migration cria as duas consultas que o painel precisa, com guarda explicita.
--
-- POR QUE RPC EM VEZ DE LEITURA DIRETA:
-- 1) a RLS de login_attempts e admin/supervisor-only hoje, mas a RLS e a UNICA barreira: uma
--    policy permissiva futura (foi o caso de "System can manage login attempts", USING true,
--    removida em 20260315115805) reabre a leitura para qualquer authenticated. A RPC
--    repete a checagem public.is_admin_or_supervisor(auth.uid()) DENTRO da funcao: falha
--    fechado. A guarda ESPELHA a policy de SELECT da tabela ("Admins and supervisors can
--    view login attempts"): a RPC nunca concede plateia maior nem menor que a leitura direta.
-- 2) o painel precisa de periodo, filtro por email, recorte de forca bruta, paginacao e
--    do motivo do bloqueio derivado — devolver isso pela RPC evita expor a tabela e
--    devolver colunas que o painel nao usa.
--
-- DADO SENSIVEL: a tabela nao guarda senha nem hash nem token; o retorno traz email,
-- contagem, datas, ip e user_agent — exatamente o que a policy admin-only ja expoe hoje
-- numa leitura direta. Nao devolvemos nada alem disso.
--
-- SEMANTICA DE p_so_falhas (importante): a tabela login_attempts guarda UMA linha por
-- email com falha AINDA NAO RESOLVIDA (o login com sucesso chama clear_login_attempts e
-- APAGA a linha — ver supabase/functions/auth-login/index.ts:193). Ou seja, toda linha
-- restante ja e uma falha; o recorte que existe de verdade no dado e por contagem.
-- Logo: p_so_falhas = true (padrao) devolve so as contas que ja atingiram o limiar de
-- bloqueio por tentativas (attempt_count >= limiar de forca bruta), e false devolve
-- tambem as tentativas esporadicas abaixo do limiar. O limiar acompanha o ADR-006
-- (bloqueio exponencial a partir de 5 tentativas).

create function public.admin_login_attempts(
  p_periodo    text    default '7d',
  p_email_like text    default null,
  p_so_falhas  boolean default true,
  p_pagina     integer default 1
)
returns table (
  email           text,
  attempt_count   integer,
  last_attempt_at timestamptz,
  locked_until    timestamptz,
  ip_address      text,
  user_agent      text,
  bloqueado_agora boolean,
  total_linhas    bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c_limiar constant integer := 5;            -- limiar de forca bruta do ADR-006
  c_pagina constant integer := 25;           -- tamanho fixo de pagina do painel
  c_pagina_max constant integer := 4000;     -- teto anti-abuso (100k linhas)
  v_intervalo interval;
  v_filtro text;
begin
  -- guarda de autorizacao: admin ou supervisor autenticado (service_role/anon caem aqui)
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'admin_login_attempts: acesso restrito a administradores e supervisores'
      using errcode = '42501';
  end if;

  -- periodo: lista fechada, nunca intervalo montado a partir do cliente
  if p_periodo is null or p_periodo not in ('24h', '7d', '30d', '90d', 'all') then
    raise exception 'admin_login_attempts: periodo invalido (use 24h, 7d, 30d, 90d ou all)'
      using errcode = '22023';
  end if;
  v_intervalo := case p_periodo
    when '24h' then interval '24 hours'
    when '7d'  then interval '7 days'
    when '30d' then interval '30 days'
    when '90d' then interval '90 days'
    else null
  end;

  -- filtro por email: busca por subcadeia, sem curinga do cliente (position, nao ilike)
  if p_email_like is not null then
    v_filtro := btrim(p_email_like);
    if v_filtro = '' then
      v_filtro := null;
    elsif length(v_filtro) > 254 then
      raise exception 'admin_login_attempts: filtro de email longo demais'
        using errcode = '22023';
    end if;
  end if;

  -- pagina: inteiro >= 1, com teto
  if p_pagina is null or p_pagina < 1 then
    raise exception 'admin_login_attempts: pagina invalida (inteiro >= 1)'
      using errcode = '22023';
  end if;
  if p_pagina > c_pagina_max then
    raise exception 'admin_login_attempts: pagina acima do teto (%)', c_pagina_max
      using errcode = '22023';
  end if;

  return query
  with base as (
    select l.email, l.attempt_count, l.last_attempt_at, l.locked_until, l.ip_address, l.user_agent
    from public.login_attempts l
    where (v_intervalo is null or l.last_attempt_at >= now() - v_intervalo)
      and (v_filtro is null or position(lower(v_filtro) in lower(l.email)) > 0)
      and (not coalesce(p_so_falhas, true) or l.attempt_count >= c_limiar)
  )
  select b.email,
         b.attempt_count,
         b.last_attempt_at,
         b.locked_until,
         b.ip_address,
         b.user_agent,
         (b.locked_until is not null and b.locked_until > now()) as bloqueado_agora,
         count(*) over () as total_linhas
  from base b
  order by b.last_attempt_at desc nulls last, b.email asc
  limit c_pagina
  offset (p_pagina - 1) * c_pagina;
end;
$$;

-- Contas bloqueadas AGORA (locked_until no futuro). motivo e derivado do dado disponivel:
-- 'excesso_de_tentativas' quando a contagem ja passou do limiar do ADR-006; nos demais
-- casos o bloqueio veio de outra origem (operacao/ajuste manual) -> 'bloqueio_manual'.
create function public.admin_blocked_accounts()
returns table (
  email           text,
  attempt_count   integer,
  locked_until    timestamptz,
  motivo          text,
  last_attempt_at timestamptz,
  ip_address      text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c_limiar constant integer := 5;
begin
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'admin_blocked_accounts: acesso restrito a administradores e supervisores'
      using errcode = '42501';
  end if;

  return query
  select l.email,
         l.attempt_count,
         l.locked_until,
         case when l.attempt_count >= c_limiar then 'excesso_de_tentativas'
              else 'bloqueio_manual' end as motivo,
         l.last_attempt_at,
         l.ip_address
  from public.login_attempts l
  where l.locked_until is not null
    and l.locked_until > now()
  order by l.locked_until desc, l.email asc;
end;
$$;

-- ACL: so o admin/supervisor autenticado. Fecha PUBLIC e anon (a checagem interna e
-- SECURITY DEFINER, entao sem isto o anon chegaria na funcao). service_role nao precisa:
-- o painel chama com JWT authenticated.
revoke all on function public.admin_login_attempts(text, text, boolean, integer) from public, anon;
revoke all on function public.admin_blocked_accounts() from public, anon;
grant execute on function public.admin_login_attempts(text, text, boolean, integer) to authenticated;
grant execute on function public.admin_blocked_accounts() to authenticated;
