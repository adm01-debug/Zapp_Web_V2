-- contact_response_stats: tempo de resposta passa a respeitar p_days (janela recente)
-- Rollback: create or replace function public.contact_response_stats( p_contact_id uuid, p_days integer default 30 ) returns table ( total_messages bigint, total_conversations bigint, messages_recent bigint, messages_previous bigint, messages_change_percent numeric, conversations_recent bigint, conversations_previous bigint, conversations_change_percent numeric, response_samples bigint, avg_response_minutes numeric, median_response_minutes numeric, csat_average numeric, csat_count bigint ) language sql stable security definer set search_path = public, pg_temp as $function$ with params as ( select now() as agora, make_interval(days => case when p_days is null or p_days < 1 then 30 else p_days end) as janela ), alvo as ( select p_contact_id as contact_id from params where public.is_contact_visible_to_user(p_contact_id, auth.uid()) ), msg as ( select m.sender, m.created_at, lead(m.sender) over w as next_sender, lead(m.created_at) over w as next_created_at from public.messages m join alvo on alvo.contact_id = m.contact_id window w as (order by m.created_at, m.id) ), pares as ( select (extract(epoch from (next_created_at - created_at)) / 60.0)::numeric as minutos from msg where sender = 'contact' and next_sender = 'agent' and next_created_at is not null ), contagens_msg as ( select count(*) as total, count(*) filter (where m.created_at >= p.agora - p.janela) as recentes, count(*) filter ( where m.created_at >= p.agora - (p.janela * 2) and m.created_at < p.agora - p.janela ) as anteriores from public.messages m join alvo on alvo.contact_id = m.contact_id cross join params p ), contagens_conv as ( select count(*) as total, count(*) filter (where s.first_message_at >= p.agora - p.janela) as recentes, count(*) filter ( where s.first_message_at >= p.agora - (p.janela * 2) and s.first_message_at < p.agora - p.janela ) as anteriores from public.conversation_sla s join alvo on alvo.contact_id = s.contact_id cross join params p ), csat as ( select avg(r.rating)::numeric as media, count(*) as total from public.csat_surveys r join alvo on alvo.contact_id = r.contact_id ) select cm.total, cc.total, cm.recentes, cm.anteriores, case when cm.anteriores = 0 then null else round(((cm.recentes - cm.anteriores)::numeric / cm.anteriores) * 100) end, cc.recentes, cc.anteriores, case when cc.anteriores = 0 then null else round(((cc.recentes - cc.anteriores)::numeric / cc.anteriores) * 100) end, (select count(*) from pares), (select round(avg(minutos), 2) from pares), (select round(percentile_cont(0.5) within group (order by minutos)::numeric, 2) from pares), csat.media, csat.total from alvo cross join contagens_msg cm cross join contagens_conv cc cross join csat; $function$; comment on function public.contact_response_stats(uuid, integer) is 'PE-22: estatísticas do contato (contagens, variação por janela, tempo de resposta do agente com média e mediana e CSAT) numa só chamada. Respeita a visibilidade do contato; devolve conjunto vazio para contato não visível.';
--
-- [refazer 1] (t_4654e681). A recusa apontou que o tempo de resposta contava
-- pares de TODO o histórico, ignorando p_days (ponto 1): com a janela zerada a
-- média misturava conversa antiga com a janela que o painel mostra, e o teste
-- (300 pares a 90 dias, fora da janela) consagrava esse comportamento.
--
-- CORREÇÃO (mínima): a CTE `pares` passa a exigir a mensagem do contato dentro
-- da janela recente [agora - p_days, agora). O lead() continua calculado sobre
-- o histórico INTEIRO (ordenado por created_at, id) e o filtro vem DEPOIS, para
-- não perder a resposta de um par da borda (contato no fim da janela cuja
-- resposta chega já fora dela). Contagens, CSAT, visibilidade, ACL e assinatura
-- não mudam; nenhum objeto existente é alterado além do corpo desta RPC.
--
-- SEMÂNTICA (atualizada):
--   * Um "par" é uma mensagem do contato seguida IMEDIATAMENTE (na ordem
--     created_at, id) por uma mensagem do agente; o tempo é a diferença em
--     minutos. Conta só o par cuja MENSAGEM DO CONTATO está na janela recente
--     [agora - p_days, agora) — o lead() é calculado sobre o histórico inteiro
--     antes do filtro para não perder a borda.
--   * p_days (default 30) define a "janela recente" [agora - p_days, agora) e a
--     "janela anterior" [agora - 2*p_days, agora - p_days), valendo para as
--     contagens E para o tempo de resposta. A variação percentual é NULL quando
--     a janela anterior é 0 (o mesmo contrato do windowChangePercent do cliente).
--   * VISIBILIDADE: a função é SECURITY DEFINER (lê messages/conversation_sla/
--     csat_surveys sem RLS), então o portão é explícito — contato não visível
--     para auth.uid() devolve CONJUNTO VAZIO (0 linhas), exatamente como o RPC
--     irmão get_inbox_contact_summaries. Contato inexistente e contato de outro
--     atendente produzem a MESMA resposta (nenhuma linha): sem oráculo de
--     existência. Contato visível SEM dados devolve uma linha zerada.
--   * Somente leitura: STABLE, sem DML — não dispara gatilho nem altera nada.

create or replace function public.contact_response_stats(
  p_contact_id uuid,
  p_days integer default 30
)
returns table (
  total_messages bigint,
  total_conversations bigint,
  messages_recent bigint,
  messages_previous bigint,
  messages_change_percent numeric,
  conversations_recent bigint,
  conversations_previous bigint,
  conversations_change_percent numeric,
  response_samples bigint,
  avg_response_minutes numeric,
  median_response_minutes numeric,
  csat_average numeric,
  csat_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with params as (
    select
      now() as agora,
      make_interval(days => case when p_days is null or p_days < 1 then 30 else p_days end) as janela
  ),
  -- Portão de visibilidade: sem linha aqui, a função não devolve nada.
  alvo as (
    select p_contact_id as contact_id
    from params
    where public.is_contact_visible_to_user(p_contact_id, auth.uid())
  ),
  msg as (
    select
      m.sender,
      m.created_at,
      lead(m.sender) over w as next_sender,
      lead(m.created_at) over w as next_created_at
    from public.messages m
    join alvo on alvo.contact_id = m.contact_id
    window w as (order by m.created_at, m.id)
  ),
  pares as (
    select (extract(epoch from (next_created_at - created_at)) / 60.0)::numeric as minutos
    from msg
    cross join params p
    where sender = 'contact'
      and next_sender = 'agent'
      and next_created_at is not null
      -- Só a janela recente: a mensagem do contato tem de estar em
      -- [agora - p_days, agora). O lead() acima corre sobre o histórico
      -- inteiro e só então filtra, para não perder a resposta de um par da
      -- borda (contato no fim da janela, resposta já fora dela).
      and created_at >= p.agora - p.janela
      and created_at < p.agora
  ),
  contagens_msg as (
    select
      count(*) as total,
      count(*) filter (where m.created_at >= p.agora - p.janela) as recentes,
      count(*) filter (
        where m.created_at >= p.agora - (p.janela * 2)
          and m.created_at < p.agora - p.janela
      ) as anteriores
    from public.messages m
    join alvo on alvo.contact_id = m.contact_id
    cross join params p
  ),
  contagens_conv as (
    select
      count(*) as total,
      count(*) filter (where s.first_message_at >= p.agora - p.janela) as recentes,
      count(*) filter (
        where s.first_message_at >= p.agora - (p.janela * 2)
          and s.first_message_at < p.agora - p.janela
      ) as anteriores
    from public.conversation_sla s
    join alvo on alvo.contact_id = s.contact_id
    cross join params p
  ),
  csat as (
    select
      avg(r.rating)::numeric as media,
      count(*) as total
    from public.csat_surveys r
    join alvo on alvo.contact_id = r.contact_id
  )
  select
    cm.total,
    cc.total,
    cm.recentes,
    cm.anteriores,
    case when cm.anteriores = 0 then null
         else round(((cm.recentes - cm.anteriores)::numeric / cm.anteriores) * 100)
    end,
    cc.recentes,
    cc.anteriores,
    case when cc.anteriores = 0 then null
         else round(((cc.recentes - cc.anteriores)::numeric / cc.anteriores) * 100)
    end,
    (select count(*) from pares),
    (select round(avg(minutos), 2) from pares),
    (select round(percentile_cont(0.5) within group (order by minutos)::numeric, 2) from pares),
    csat.media,
    csat.total
  from alvo
  cross join contagens_msg cm
  cross join contagens_conv cc
  cross join csat;
$function$;

comment on function public.contact_response_stats(uuid, integer) is
  'PE-22: estatísticas do contato (contagens, variação por janela, tempo de resposta do agente na janela recente com média e mediana e CSAT) numa só chamada. Respeita a visibilidade do contato; devolve conjunto vazio para contato não visível.';

-- Negar por padrão: a assinatura exata é a única que fica executável por
-- authenticated/service_role (nada para PUBLIC nem anon).
revoke all on function public.contact_response_stats(uuid, integer) from public, anon;
grant execute on function public.contact_response_stats(uuid, integer) to authenticated, service_role;
