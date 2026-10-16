-- delivery_stats
-- Rollback: remove a RPC public.delivery_stats(uuid, integer); nao toca dados.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.delivery_stats(uuid, integer);
--
-- PROBLEMA (cartao t_bfec4bd2)
-- A V3 tem o painel DeliveryStatsPanel (enviadas/entregues/lidas por hora) calculado
-- no navegador sobre as ultimas 500 mensagens. A V2 nao tem equivalente: qualquer
-- leitura do tipo faria o front baixar 500 linhas para somar no cliente (o mesmo
-- defeito que a RPC inbox_wait_summary tirou da contagem de chips) e o numero
-- mudaria conforme a amostra.
--
-- CORRECAO (aditiva: uma funcao nova, nenhuma coluna, tabela, policy, GRANT ou dado
-- existente e alterado): a RPC AGREGADA public.delivery_stats devolve o recorte
-- ja somado no servidor, sem baixar linha nenhuma.
--
-- O QUE CONTA (so dado real; nenhum numero e sintetizado)
--   * janela: mensagens do contato com created_at nos ultimos p_hours horas;
--   * linha apagada (is_deleted = true) fica FORA (entrega apagada nao e entrega);
--   * "entrega" e mensagem NOSSA: so linhas com sender = 'agent'. Mensagem recebida
--     (sender <> 'agent') nunca e "enviada/entregue/lida" por nos e sai em totals.received;
--   * status (unica fonte de verdade: coluna messages.status), do mesmo jeito que o
--     fallback real da V3 e a serie da V2 (20260930670000): 'sent' EXATO nao basta
--     ("delivered"/"read" tambem foi enviado — foi o bug corrigido na V16 do TalkX);
--       sent      = status in ('sent','delivered','read','played')
--       delivered = status in ('delivered','read','played')
--       read      = status in ('read','played')
--       failed    = status = 'failed'
--     status NULL ou 'pending'/'sending' nao conta como enviada (ainda nao saiu);
--   * total_messages = TODAS as linhas nao apagadas do contato na janela (as duas
--     direcoes), para o numero bater com o que existe em messages;
--   * created_at e o relogio de todos os recortes (a V2 guarda so o ULTIMO status em
--     status_updated_at, nao um historico de eventos; entao entregue/lida contam na
--     hora do ENVIO, e nao na hora em que o recibo chegou — documentado de proposito).
--
-- IS_GROUP (duas formas REAIS de contato de grupo na V2, qualquer uma basta):
--   1) telefone no formato do JID de grupo <digitos>-<digitos> — a MESMA regra do front
--      (ContactTypeFilter.tsx:29-30, R2-INB-055): so digitos e o hifen sobrevivem;
--   2) o telefone casa com um grupo do cadastro public.whatsapp_groups
--      (`replace(group_id, '@g.us', '') = contacts.phone`), que e como o webhook grava
--      o grupo hoje (JID moderno `120363295648424210@g.us`, sem hifen) e como
--      useGroupActions associa grupo e contato. Sem esta segunda regra, grupo moderno
--      passaria por contato comum.
--
-- POR HORA: buckets de 1 hora em UTC (deterministico, independente do fuso da sessao);
-- o front formata para o fuso local. Cada ponto: { hour, sent, delivered, read }.
--
-- POR PARTICIPANTE (grupo) — NAO ENTREGUE, e nao por falta de vontade: a V2 nao tem
-- esse dado, em lugar nenhum.
--   1) A linha de messages nao sabe QUEM, dentro do grupo, escreveu: a coluna sender
--      tem CHECK real `messages_sender_check CHECK (sender = ANY (ARRAY['agent','contact']))`
--      (conferido no banco local e no retrato da producao). Nao existe coluna de JID/participante
--      em messages, e nao existe tabela de participantes de grupo (a unica coisa perto e
--      whatsapp_groups.participant_count, que e so a contagem de membros).
--   2) A mensagem RECEBIDA de grupo nem chega a ser gravada: o webhook descarta
--      (evolution-webhook-messages.ts:568 e :648 — `if (!phone || bestJid?.includes('@g.us')) {` ... `return;` }).
-- Por isso esta funcao NAO devolve a chave `participants`: devolver um array sempre vazio
-- (ou agrupado por sender, que so tem 'agent'/'contact') seria numero de fachada, que e
-- exatamente o defeito que este cartao manda nao repetir. Para o recorte por participante
-- existir falta gravar o autor da mensagem de grupo (schema + edge) — esta registrado no
-- cartao t_bfec4bd2 como trabalho de outra area.
--
-- VISIBILIDADE: mesma trava da RLS de public.contacts — public.is_contact_visible_to_user
-- (admin/supervisor, agentes visiveis ao chamador ou membro ativo da fila do contato).
-- Sem acesso, com auth.uid() nulo (service_role) ou contato inexistente/apagado a funcao
-- devolve NULL: mesma resposta nos tres casos, para nao virar oraculo de existencia.
-- Contato visivel SEM mensagem na janela devolve o objeto com zeros e timeline vazia.
--
-- CONTRATO (as chaves do jsonb; nenhuma outra)
--   contact_id, is_group, window_hours,
--   totals: { sent, delivered, read, failed, received, total_messages,
--             last_sent_at, last_delivered_at, last_read_at },
--   timeline: [ { hour, sent, delivered, read } ]
-- `participants` NAO faz parte do contrato enquanto o autor da mensagem de grupo nao
-- for gravado (motivo acima). Quem portar o painel da V3 deve tratar a secao
-- "por participante" como indisponivel nesta versao.
--
-- SEGURANCA: SECURITY DEFINER com search_path fixo (a funcao soma por cima da RLS, por
-- isso DEFINER) e ACL pelo DEFAULT DENY: EXECUTE revogado de PUBLIC e de anon, concedido
-- a authenticated. O service_role aparece com EXECUTE so pela ACL PADRAO do projeto para
-- funcao nova (postgres|f|{...service_role=X...}); nao ha nada a fazer e nao serve de
-- nada aqui — sem auth.uid() a funcao devolve NULL para qualquer contato.

create or replace function public.delivery_stats(
  p_contact_id uuid,
  p_hours integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz;
  v_is_group boolean;
  v_result jsonb;
begin
  if p_contact_id is null then
    return null;
  end if;

  if p_hours is null or p_hours < 1 then
    raise exception 'delivery_stats: p_hours invalido (%)', p_hours
      using errcode = '22023';
  end if;

  if auth.uid() is null
     or not public.is_contact_visible_to_user(p_contact_id, auth.uid()) then
    return null;
  end if;

  -- Classificador de grupo (as duas formas reais documentadas no cabecalho).
  select (
      regexp_replace(coalesce(c.phone, ''), '[^0-9-]', '', 'g') ~ '^[0-9]+-[0-9]+$'
      or exists (
        select 1
        from public.whatsapp_groups g
        where replace(g.group_id, '@g.us', '') = c.phone
      )
    )
    into v_is_group
  from public.contacts c
  where c.id = p_contact_id
    and c.deleted_at is null;

  if v_is_group is null then
    -- contato inexistente ou soft-deleted: nada a devolver.
    return null;
  end if;

  v_from := now() - make_interval(hours => p_hours);

  with janela as (
    select
      m.sender,
      m.status,
      m.created_at
    from public.messages m
    where m.contact_id = p_contact_id
      and m.created_at >= v_from
      and coalesce(m.is_deleted, false) = false
  ),
  contagem as (
    select
      count(*) filter (
        where j.sender = 'agent' and j.status in ('sent', 'delivered', 'read', 'played')
      )::integer as sent,
      count(*) filter (
        where j.sender = 'agent' and j.status in ('delivered', 'read', 'played')
      )::integer as delivered,
      count(*) filter (
        where j.sender = 'agent' and j.status in ('read', 'played')
      )::integer as read,
      count(*) filter (
        where j.sender = 'agent' and j.status = 'failed'
      )::integer as failed,
      count(*) filter (where j.sender <> 'agent')::integer as received,
      count(*)::integer as total_messages,
      max(j.created_at) filter (
        where j.sender = 'agent' and j.status in ('sent', 'delivered', 'read', 'played')
      ) as last_sent_at,
      max(j.created_at) filter (
        where j.sender = 'agent' and j.status in ('delivered', 'read', 'played')
      ) as last_delivered_at,
      max(j.created_at) filter (
        where j.sender = 'agent' and j.status in ('read', 'played')
      ) as last_read_at
    from janela j
  ),
  horas as (
    select
      -- bucket de 1 hora em UTC, devolvido como timestamptz (o front converte o fuso).
      (date_trunc('hour', j.created_at at time zone 'UTC') at time zone 'UTC') as hour,
      count(*) filter (
        where j.sender = 'agent' and j.status in ('sent', 'delivered', 'read', 'played')
      )::integer as sent,
      count(*) filter (
        where j.sender = 'agent' and j.status in ('delivered', 'read', 'played')
      )::integer as delivered,
      count(*) filter (
        where j.sender = 'agent' and j.status in ('read', 'played')
      )::integer as read
    from janela j
    group by 1
  )
  select jsonb_build_object(
    'contact_id', p_contact_id,
    'is_group', v_is_group,
    'window_hours', p_hours,
    'totals', to_jsonb(contagem.*),
    'timeline', coalesce(
      (select jsonb_agg(to_jsonb(h) order by h.hour) from horas h),
      '[]'::jsonb
    )
  )
  into v_result
  from contagem;

  return v_result;
end;
$$;

-- DEFAULT DENY: nada de EXECUTE para PUBLIC/anon.
revoke all on function public.delivery_stats(uuid, integer) from public, anon;
grant execute on function public.delivery_stats(uuid, integer) to authenticated;
