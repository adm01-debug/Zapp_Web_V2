-- agent_workload
-- Rollback: a função é nova e só existe por causa desta migration (é o único objeto que
--   ela cria; nenhum dado, policy, GRANT de outro objeto ou trigger é tocado). O DROP
--   abaixo devolve o banco ao estado anterior e o painel /agentes volta a usar as
--   consultas dos hooks (useAgents/useAgentPendingCounts/useAgentRecentSends).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.agent_workload();

-- R2-MOD-*/3ª passada da auditoria V3 -> V2 (docs/estado/05-features-admin.md):
-- carga por atendente agregada no SERVIDOR.
--
-- PROBLEMA: o painel /agentes montava a carga de cada atendente no navegador baixando
-- linhas cruas: `useAgents.ts` puxava TODOS os contatos com `assigned_to` não nulo
-- (via fetchAllRows), `useAgentPendingCounts.ts` puxava TODOS os contatos em `waiting`
-- e `useAgentRecentSends.ts` puxava TODAS as mensagens de agente dos últimos 30 dias só
-- para achar o `MAX(created_at)` por atendente — milhares de linhas trafegadas para
-- calcular três contagens.
--
-- ENTREGA (só este problema): a RPC `agent_workload()` devolve, POR PERFIL, os três
-- números que os hooks calculam hoje:
--   open_chats    = contatos com `assigned_to` = perfil, `conversation_status = 'open'`
--                   e não excluídos (`deleted_at IS NULL`);
--   waiting_chats = idem, com `conversation_status = 'waiting'`;
--   last_send_at  = `MAX(created_at)` das mensagens com `sender = 'agent'` e
--                   `agent_id` = perfil dentro da MESMA janela de 30 dias do hook
--                   (`RECENT_SENDS_WINDOW_DAYS`), NULL quando não houve envio na janela.
-- A régua é copiada linha a linha dos hooks atuais (mesmos filtros, mesmo estado de espera
-- persistido), então os números coincidem — não é uma segunda definição de "carga".
--
-- Autorização: SECURITY DEFINER (a agregação lê contatos e mensagens de TODA a equipe, o
-- que a RLS de leitura por atendente barraria para um supervisor). O acesso é restrito a
-- admin/supervisor pelo MESMO predicado das outras RPCs de painel
-- (public.is_admin_or_supervisor(auth.uid())); agente comum é NEGADO com
-- `insufficient_privilege` (não devolve conjunto vazio — o painel de equipe é só de staff).
-- service_role (chamada interna de Edge) passa, como nas demais RPCs de painel.

create or replace function public.agent_workload()
returns table (
  profile_id uuid,
  open_chats integer,
  waiting_chats integer,
  last_send_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_jwt_role text;
  v_since timestamptz;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');

  if v_jwt_role <> 'service_role'
     and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then
    raise exception 'agent_workload: acesso restrito a admin ou supervisor'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mesma janela de 30 dias de RECENT_SENDS_WINDOW_DAYS (useAgentRecentSends.ts).
  v_since := now() - interval '30 days';

  return query
  with open_counts as (
    select c.assigned_to as profile_id, count(*)::integer as total
      from public.contacts c
     where c.assigned_to is not null
       and c.conversation_status = 'open'
       and c.deleted_at is null
     group by c.assigned_to
  ),
  waiting_counts as (
    select c.assigned_to as profile_id, count(*)::integer as total
      from public.contacts c
     where c.assigned_to is not null
       and c.conversation_status = 'waiting'
       and c.deleted_at is null
     group by c.assigned_to
  ),
  last_sends as (
    select m.agent_id as profile_id, max(m.created_at) as last_send_at
      from public.messages m
     where m.sender = 'agent'
       and m.agent_id is not null
       and m.created_at >= v_since
     group by m.agent_id
  )
  select p.id as profile_id,
         coalesce(o.total, 0) as open_chats,
         coalesce(w.total, 0) as waiting_chats,
         l.last_send_at as last_send_at
    from public.profiles p
    left join open_counts o on o.profile_id = p.id
    left join waiting_counts w on w.profile_id = p.id
    left join last_sends l on l.profile_id = p.id
   order by p.id;
end;
$function$;

revoke all on function public.agent_workload() from public, anon;
grant execute on function public.agent_workload() to authenticated, service_role;

comment on function public.agent_workload() is
  'Carga por atendente agregada no servidor (3ª passada admin): por perfil devolve open_chats (contacts.conversation_status=open, assigned_to=perfil, deleted_at IS NULL), waiting_chats (idem waiting) e last_send_at (MAX(messages.created_at) com sender=agent e agent_id=perfil nos últimos 30 dias). SECURITY DEFINER, só admin/supervisor (agente comum recebe insufficient_privilege) — mesmos filtros dos hooks useAgents/useAgentPendingCounts/useAgentRecentSends.';
