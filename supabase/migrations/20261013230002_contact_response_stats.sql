-- contact_response_stats
-- Rollback: dropa a RPC nova (o cartão só ADICIONA um objeto; nada existente é alterado).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.contact_response_stats(uuid, integer);
--
-- PE-22 (CRM360 — estatísticas do contato / "Painel de Estatísticas").
--
-- PROBLEMA: ContactService.fetchStats montava o painel com VÁRIAS idas ao banco:
--   1) head count de mensagens (total);
--   2) head count de conversation_sla (conversas);
--   3) `messages` com `.order('created_at',{ascending:true}).limit(200)` para
--      calcular o TEMPO DE RESPOSTA — ou seja, lia só as 200 mensagens MAIS
--      ANTIGAS do contato (o "começo da história"), ignorando todo o resto e
--      enviesando a média; e uma 4ª consulta só para saber se o painel está vazio.
--   Além disso, a média vinha sozinha: sem MEDIANA e sem o tamanho da amostra,
--   um único par atípico distorcia o número exibido.
--
-- SOLUÇÃO: uma RPC única que devolve, numa só chamada:
--   * contagens de mensagens e conversas (total + janela recente + janela
--     anterior) e a variação percentual entre as janelas, como o painel mostra;
--   * o tempo de resposta do agente calculado com window function (LEAD) sobre
--     TODO o histórico do contato — sem o corte enviesado de 200 linhas;
--   * média E MEDIANA dos tempos de resposta, mais o número de pares medidos,
--     para o painel saber o quanto confiar na média;
--   * a média e a contagem de CSAT.
--
-- SEMÂNTICA:
--   * Um "par" é uma mensagem do contato seguida IMEDIATAMENTE (na ordem
--     created_at, id) por uma mensagem do agente; o tempo é a diferença em
--     minutos. Pares são contados sobre o histórico inteiro (o rótulo do painel
--     é "Desde o início do relacionamento").
--   * p_days (default 30) define a "janela recente" [agora - p_days, agora) e a
--     "janela anterior" [agora - 2*p_days, agora - p_days). A variação
--     percentual é NULL quando a janela anterior é 0 (o mesmo contrato do
--     windowChangePercent do cliente).
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
    where sender = 'contact'
      and next_sender = 'agent'
      and next_created_at is not null
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
  'PE-22: estatísticas do contato (contagens, variação por janela, tempo de resposta do agente com média e mediana e CSAT) numa só chamada. Respeita a visibilidade do contato; devolve conjunto vazio para contato não visível.';

-- Negar por padrão: a assinatura exata é a única que fica executável por
-- authenticated/service_role (nada para PUBLIC nem anon).
revoke all on function public.contact_response_stats(uuid, integer) from public, anon;
grant execute on function public.contact_response_stats(uuid, integer) to authenticated, service_role;
