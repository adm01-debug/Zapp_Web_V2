-- inbox_wait_summary
-- Rollback: remove a RPC de metricas de espera (public.inbox_wait_summary); nao toca dados.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.inbox_wait_summary(uuid);
--
-- Metricas de espera da inbox POR FILA calculadas no servidor.
--
-- Motivo: o front calcula hoje os chips ("Aguardando (N)") sobre a amostra de
-- contatos carregada na tela (teto de 500 linhas). Passando disso, o numero
-- exibido fica MENOR que a realidade — o chip mente sem que ninguem perceba.
-- Esta RPC devolve o agregado real do banco, por fila, com o mesmo recorte que
-- a lista aplica do lado do cliente (chipCounts.ts):
--
--   * "aguardando"  = contacts.conversation_status = 'waiting' (isWaiting);
--   * "em aberto"   = conversation_status in ('open','waiting') (isOpenActive);
--   * conversa      = contato com AO MENOS UMA mensagem (guarda de atividade do
--                     ADR-005, passo 3: mantem fora da inbox o contato historico
--                     que nunca conversou); exclui contato soft-deleted;
--   * tempo de espera / tempo em aberto = relogio canonico da V2,
--                     contacts.updated_at (supervisorPriority.ts:20-22). O
--                     conversation_status_changed_at varia de semantica entre
--                     as telas e NAO e este relogio.
--
-- Escopo de visibilidade: cada contato passa por
-- public.is_contact_visible_to_user(c.id, auth.uid()) — exatamente a trava que
-- a RLS ja impoe em public.contacts (admin/supervisor, agentes visiveis pelo
-- chamador ou membro ativo da fila). A RPC nunca revela contato fora do escopo
-- do chamador.
--
-- Retorno (uma linha por fila com conversa visivel ao chamador):
--   queue_id          fila (NULL = contatos sem fila);
--   waiting_count     quantas conversas estao aguardando nessa fila;
--   max_wait_seconds  maior tempo de espera atual (segundos), NULL se nao ha aguardando;
--   avg_open_seconds  tempo medio em aberto (segundos) entre as conversas abertas.
-- Com p_queue_id informado, o resultado fica restrito a essa fila (0 ou 1 linha).
--
-- Seguranca: SECURITY DEFINER com search_path fixo (a funcao le public.contacts e
-- public.messages por cima da RLS, por isso e DEFINER) e ACL pelo DEFAULT DENY:
-- EXECUTE revogado de PUBLIC e anon, concedido so a authenticated e service_role.

create or replace function public.inbox_wait_summary(p_queue_id uuid default null)
returns table (
  queue_id uuid,
  waiting_count integer,
  max_wait_seconds bigint,
  avg_open_seconds bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with conversas as (
    select
      c.queue_id,
      c.conversation_status,
      c.updated_at
    from public.contacts c
    where c.deleted_at is null
      and c.conversation_status in ('open', 'waiting')
      and (p_queue_id is null or c.queue_id = p_queue_id)
      and public.is_contact_visible_to_user(c.id, auth.uid())
      -- ADR-005 (passo 3): conversa = contato com pelo menos uma mensagem.
      and exists (
        select 1
        from public.messages m
        where m.contact_id = c.id
      )
  )
  select
    conversas.queue_id,
    (count(*) filter (where conversas.conversation_status = 'waiting'))::integer
      as waiting_count,
    (max(extract(epoch from (now() - conversas.updated_at)))
      filter (where conversas.conversation_status = 'waiting'))::bigint
      as max_wait_seconds,
    round(avg(extract(epoch from (now() - conversas.updated_at))))::bigint
      as avg_open_seconds
  from conversas
  group by conversas.queue_id
  order by conversas.queue_id asc nulls last;
$$;

-- DEFAULT DENY: nada de EXECUTE para PUBLIC/anon.
revoke all on function public.inbox_wait_summary(uuid) from public, anon;
grant execute on function public.inbox_wait_summary(uuid)
  to authenticated, service_role;
