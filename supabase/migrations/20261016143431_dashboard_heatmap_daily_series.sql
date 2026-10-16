-- dashboard_heatmap_daily_series
-- Rollback: remove a funcao nova de serie diaria do heatmap; ACL e COMMENT cai junto com o objeto, entao DROP basta.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.dashboard_heatmap_daily(integer);
--
-- Portal do Contato / Dashboard (t_b2c0fca9): serie DIARIA de mensagens recebidas.
--
-- PROBLEMA (V2): o Dashboard (ActivityHeatmap.tsx) precisa de 1 ponto por dia,
-- cobrindo ate 365 dias, para o seletor 7/30/90/365 dias. Nao existe leitura
-- agregada no banco para isso: o front teria de trazer linhas cruas de
-- public.messages e agrupar no cliente, onde (a) a data sairia no fuso do
-- NAVEGADOR e (b) o PostgREST corta a amostra em 1000 linhas — a contagem
-- "real" vira uma amostra arbitraria (mesmo achado A6 que ja motivou
-- dashboard_hourly_volume).
--
-- CORRECAO: nova RPC public.dashboard_heatmap_daily(p_days int default 30),
-- que agrega DENTRO do banco, ja no fuso do negocio (America/Sao_Paulo), e
-- devolve SEMPRE p_days linhas — uma por dia civil, dias sem mensagem com
-- total 0 (LEFT JOIN da serie completa), mais recente por ultimo. p_days tem
-- clamp 1..365 (0, negativo e acima de 365 sao presos na borda; nulo = 30).
--
-- "Mensagens recebidas" = public.messages.sender = 'contact' (inbound do
-- contato) e is_deleted IS NOT TRUE, mesma base dos demais contadores de
-- inbound do repo (register_first_response, sla_base, dashboard_heatmap).
--
-- SECURITY INVOKER (nao DEFINER): a leitura passa pela RLS de public.messages
-- do proprio chamador; a funcao so agrega. O acesso e negado por ACL, nao por
-- gate: REVOKE de PUBLIC e anon, GRANT EXECUTE so para authenticated. anon
-- morre na ACL, antes de qualquer linha ser lida. search_path fixado.

create or replace function public.dashboard_heatmap_daily(p_days integer default 30)
returns table (dia date, total bigint)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with params as (
    select least(greatest(coalesce(p_days, 30), 1), 365) as n,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  serie as (
    select (p.hoje - (p.n - 1) + g.i)::date as dia
    from params as p
    cross join generate_series(0, p.n - 1) as g(i)
  ),
  contagem as (
    select (m.created_at at time zone 'America/Sao_Paulo')::date as dia,
           count(*)::bigint as total
    from public.messages as m
    cross join params as p
    where m.sender = 'contact'
      and m.is_deleted is not true
      and m.created_at >= ((p.hoje - (p.n - 1))::timestamp at time zone 'America/Sao_Paulo')
      and m.created_at <  ((p.hoje + 1)::timestamp at time zone 'America/Sao_Paulo')
    group by 1
  )
  select s.dia,
         coalesce(c.total, 0)::bigint as total
  from serie as s
  left join contagem as c on c.dia = s.dia
  order by s.dia;
$function$;

comment on function public.dashboard_heatmap_daily(integer) is
  'Dashboard (2026-10-16): serie diaria de mensagens recebidas (sender=contact, is_deleted IS NOT TRUE) '
  'por dia civil no fuso do negocio (America/Sao_Paulo), nao no fuso do navegador. Devolve SEMPRE um '
  'ponto por dia da janela (dias sem mensagem com total 0), do mais antigo ao mais recente. p_days '
  'default 30, clamp 1..365. SECURITY INVOKER: le sob a RLS do chamador. EXECUTE so para authenticated '
  '(REVOKE de PUBLIC e anon). Substitui o agrupamento no cliente de ActivityHeatmap.tsx (new Date() no '
  'fuso do navegador e corte de 1000 linhas do PostgREST).';

revoke all on function public.dashboard_heatmap_daily(integer) from public;
revoke all on function public.dashboard_heatmap_daily(integer) from anon;
grant execute on function public.dashboard_heatmap_daily(integer) to authenticated;
