-- admin_inbox_silence
-- Rollback: remove a RPC public.admin_inbox_silence(), o indice idx_messages_sender_created_at, a restricao global_settings_inbox_silence_minutes_range e a chave inbox_silence_minutes; o painel de silencio da caixa de entrada volta a nao existir.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_inbox_silence();
--   drop index if exists public.idx_messages_sender_created_at;
--   alter table public.global_settings drop constraint if exists global_settings_inbox_silence_minutes_range;
--   delete from public.global_settings where key = 'inbox_silence_minutes';
--
-- R2-ADM-0xx (P1, painel/admin): nao existe nenhuma lista de silencio da ingestao.
-- Quando o webhook para de entregar mensagem (conexao caida, ingestao travada,
-- instancia deslogada), o admin so descobre pelo cliente reclamando: o painel de
-- monitoramento mostra taxa de entrega das SAIDAS, nao a AUSENCIA de ENTRADAS.
--
-- Esta migration entrega a UNICA peca que o front precisa do banco para o painel
-- decidir. O front (src/) calcula o aviso "uma vez por episodio" e desenha a tela;
-- aqui nao ha estado de aviso nem escrita — a RPC e somente leitura.
--
-- A RPC devolve, POR CONEXAO (whatsapp_connections):
--   received_5m / received_1h / received_24h -> quantas mensagens RECEBIDAS a
--     conexao teve em cada janela. "Recebida" e a direcao canonica do projeto:
--     sender = 'contact' (mesmo predicado de get_inbox_contact_summaries e do
--     buildConversation do cliente). Todo o resto (agente, bot, sistema) e saida.
--   last_inbound_at / last_outbound_at -> carimbo da ULTIMA mensagem recebida e
--     da ultima enviada, sem janela (quando foi a ultima vez).
--   silence_minutes -> o limiar configurado (abaixo), o mesmo para todas as linhas.
--   is_silent -> true quando a conexao nao tem mensagem recebida alguma, ou a
--     ultima recebida e mais antiga que o limiar. Nao olha o status da conexao de
--     proposito: uma conexao 'disconnected' que continua silenciosa aparece como
--     silenciosa, e o front decide o que mostrar.
--   top_conversations -> ate 10 contatos mais ativos da conexao nas ultimas 24h
--     ({contact_id, contact_name, received, last_at}); so nome de contato, sem
--     telefone, sem texto de mensagem.
--
-- Nada de PII nova nem log: nao devolve phone_number da conexao, token nem
-- conteudo de mensagem. A RPC so roda para admin/supervisor (RAISE 42501 para o
-- resto) e o EXECUTE e concedido so a authenticated e service_role.
--
-- Limiar configuravel: a chave global_settings.inbox_silence_minutes (padrao 10,
-- inteiro de 1 a 1440 minutos). A escrita ja e limitada a admin pela RLS
-- existente de global_settings ("Admins can manage global settings", Gate 16);
-- aqui entra so a restricao de FAIXA, que a RLS nao da.
--
-- Performance (medido): messages nao tem indice por (direcao, created_at). O mais
-- proximo e idx_messages_read_sender (is_read, sender) e idx_messages_created_at
-- (so created_at); nenhum cobre "sender = 'contact' no intervalo de created_at".
-- O painel chama esta RPC em intervalo curto, entao o indice entra agora.
-- Convencao do projeto: sem CONCURRENTLY (a migration roda em transacao unica).
--
-- Natureza: aditiva e idempotente. Nao altera dado existente nem objeto com dado.

create index if not exists idx_messages_sender_created_at
  on public.messages (sender, created_at desc);

insert into public.global_settings (key, value, description)
values (
  'inbox_silence_minutes',
  '10',
  'Minutos sem receber mensagem para a caixa de entrada marcar a conexao como silenciosa (1..1440).'
)
on conflict (key) do nothing;

alter table public.global_settings
  drop constraint if exists global_settings_inbox_silence_minutes_range;

alter table public.global_settings
  add constraint global_settings_inbox_silence_minutes_range
  check (
    key <> 'inbox_silence_minutes'
    or (value is not null and value ~ '^[0-9]{1,4}$' and value::integer between 1 and 1440)
  );

comment on constraint global_settings_inbox_silence_minutes_range
  on public.global_settings is
  'inbox_silence_minutes: inteiro de 1 a 1440 (minutos sem receber mensagem).';

create or replace function public.admin_inbox_silence()
returns table (
  connection_id uuid,
  connection_name text,
  connection_status text,
  received_5m bigint,
  received_1h bigint,
  received_24h bigint,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  silence_minutes integer,
  is_silent boolean,
  top_conversations jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_minutos integer;
  v_agora   timestamptz := now();
begin
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Le o limiar sem nunca estourar: valor fora do padrao cai no 10, e o clamp
  -- repete a faixa do CHECK (defesa em profundidade).
  select coalesce(max(case when value ~ '^[0-9]{1,4}$' then value::integer end), 10)
    into v_minutos
    from public.global_settings
   where key = 'inbox_silence_minutes';
  v_minutos := greatest(1, least(coalesce(v_minutos, 10), 1440));

  return query
  with recebidas as (
    select m.whatsapp_connection_id as cid,
           count(*) filter (where m.created_at >= v_agora - interval '5 minutes')::bigint as r5m,
           count(*) filter (where m.created_at >= v_agora - interval '1 hour')::bigint as r1h,
           count(*)::bigint as r24h
      from public.messages m
     where m.sender = 'contact'
       and m.created_at >= v_agora - interval '24 hours'
     group by m.whatsapp_connection_id
  ),
  entradas as (
    select distinct on (m.whatsapp_connection_id)
           m.whatsapp_connection_id as cid,
           m.created_at as ultima_entrada
      from public.messages m
     where m.sender = 'contact'
     order by m.whatsapp_connection_id, m.created_at desc
  ),
  saidas as (
    select distinct on (m.whatsapp_connection_id)
           m.whatsapp_connection_id as cid,
           m.created_at as ultima_saida
      from public.messages m
     where m.sender <> 'contact'
     order by m.whatsapp_connection_id, m.created_at desc
  ),
  ativas as (
    select z.cid,
           jsonb_agg(
             jsonb_build_object(
               'contact_id', z.contact_id,
               'contact_name', z.contact_name,
               'received', z.recebidas,
               'last_at', z.ultima
             )
             order by z.recebidas desc, z.ultima desc
           ) as top_conversations
      from (
        select m.whatsapp_connection_id as cid,
               m.contact_id,
               ct.name as contact_name,
               count(*)::bigint as recebidas,
               max(m.created_at) as ultima,
               row_number() over (
                 partition by m.whatsapp_connection_id
                 order by count(*) desc, max(m.created_at) desc
               ) as rn
          from public.messages m
          left join public.contacts ct on ct.id = m.contact_id
         where m.sender = 'contact'
           and m.contact_id is not null
           and m.created_at >= v_agora - interval '24 hours'
         group by m.whatsapp_connection_id, m.contact_id, ct.name
      ) z
     where z.rn <= 10
     group by z.cid
  )
  select c.id,
         c.name,
         c.status,
         coalesce(r.r5m, 0)::bigint,
         coalesce(r.r1h, 0)::bigint,
         coalesce(r.r24h, 0)::bigint,
         e.ultima_entrada,
         s.ultima_saida,
         v_minutos,
         (e.ultima_entrada is null
            or e.ultima_entrada < v_agora - make_interval(mins => v_minutos)),
         coalesce(a.top_conversations, '[]'::jsonb)
    from public.whatsapp_connections c
    left join recebidas r on r.cid = c.id
    left join entradas  e on e.cid = c.id
    left join saidas    s on s.cid = c.id
    left join ativas    a on a.cid = c.id
   order by c.name nulls last, c.id;
end;
$f$;

revoke all on function public.admin_inbox_silence() from public;
revoke execute on function public.admin_inbox_silence() from anon;
grant execute on function public.admin_inbox_silence() to authenticated, service_role;
