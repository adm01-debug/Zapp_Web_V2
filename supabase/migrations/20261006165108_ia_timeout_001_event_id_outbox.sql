-- ia_timeout_001_event_id_outbox
-- Rollback: drop function if exists public.ai_usage_outbox_increment_attempts(uuid); drop function if exists public.ai_usage_outbox_mark_processed(uuid); drop function if exists public.ai_usage_outbox_reserve_event(uuid, uuid); drop function if exists public.ai_usage_outbox_pending(integer); drop function if exists public.ai_usage_outbox_enqueue(uuid, jsonb, text); drop table if exists internal.ai_usage_outbox; drop index if exists public.ai_usage_logs_event_id_uidx; alter table public.ai_usage_logs drop column if exists event_id;

-- IA-TIMEOUT-001 — identidade única por evento + outbox durável do log essencial.
--
-- Por que esta migration existe (o defeito medido, item 44):
--   `_shared/ai-usage.ts` fazia UM insert e engolia a falha com `console.warn`:
--   consumo PAGO virava registro perdido, sem reenvio e sem onde reencontrá-lo.
--   O schema não tinha como garantir as duas coisas que faltavam:
--   1. UMA identidade por evento (`event_id`, uuid gerado no produtor, NUNCA
--      derivado do conteúdo) imposta por restrição de UNICIDADE — é ela que faz
--      o `INSERT ... ON CONFLICT (event_id) DO NOTHING` absorver reentrega sem
--      consulta prévia (consultar-antes-de-inserir admite corrida) e sem
--      colapsar dois consumos legítimos de conteúdo idêntico;
--   2. uma OUTBOX durável (`internal.ai_usage_outbox`): falha do insert — ou de
--      qualquer passo antes/depois dele — fica PENDENTE no banco até o
--      reprocessamento (`reprocessarOutboxDeLog`) confirmar a entrega.
--
-- Natureza: ADITIVA e IDEMPOTENTE. Coluna nova anulável, índice público novo,
-- schema/tabela internos novos e RPCs públicas de serviço. Sem backfill (linhas
-- antigas ficam com `event_id` NULL — não havia identidade de evento a preservar).

alter table public.ai_usage_logs
  add column if not exists event_id uuid;

-- A unicidade é do BANCO (não de um SELECT anterior ao insert). O índice único
-- arbitra o `ON CONFLICT (event_id)` e admite os NULLs das linhas antigas.
create unique index if not exists ai_usage_logs_event_id_uidx
  on public.ai_usage_logs (event_id);

create schema if not exists internal;

-- Outbox interna: o manifesto versionado só cobre o schema public; a tabela de
-- fila não é API pública. O acesso acontece pelas RPCs SECURITY DEFINER abaixo,
-- com EXECUTE revogado de PUBLIC/anon/authenticated e concedido a service_role.
create table if not exists internal.ai_usage_outbox (
  id uuid not null default gen_random_uuid(),
  constraint ai_usage_outbox_pkey primary key (id),
  event_id uuid,
  payload jsonb not null,
  motivo text not null,
  tentativas integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists ai_usage_outbox_event_id_uidx
  on internal.ai_usage_outbox (event_id);

create index if not exists idx_ai_usage_outbox_pendentes
  on internal.ai_usage_outbox (created_at)
  where processed_at is null;

create or replace function public.ai_usage_outbox_enqueue(
  p_event_id uuid,
  p_payload jsonb,
  p_motivo text
) returns boolean
language plpgsql
security definer
set search_path = internal, public, pg_temp
as $$
begin
  insert into internal.ai_usage_outbox (event_id, payload, motivo)
  values (p_event_id, p_payload, p_motivo)
  on conflict (event_id) do update
    set processed_at = case
          when internal.ai_usage_outbox.processed_at is not null then null
          else internal.ai_usage_outbox.processed_at
        end,
        tentativas = case
          when internal.ai_usage_outbox.processed_at is not null then 0
          else internal.ai_usage_outbox.tentativas
        end,
        payload = case
          when internal.ai_usage_outbox.processed_at is not null then excluded.payload
          else internal.ai_usage_outbox.payload
        end,
        motivo = case
          when internal.ai_usage_outbox.processed_at is not null then excluded.motivo
          else internal.ai_usage_outbox.motivo
        end;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.ai_usage_outbox_pending(p_limite integer default 50)
returns table(id uuid, event_id uuid, payload jsonb, tentativas integer)
language sql
security definer
set search_path = internal, public, pg_temp
as $$
  select o.id, o.event_id, o.payload, o.tentativas
  from internal.ai_usage_outbox o
  where o.processed_at is null
  order by o.created_at asc
  limit greatest(1, p_limite);
$$;

create or replace function public.ai_usage_outbox_reserve_event(
  p_id uuid,
  p_event_id uuid
) returns boolean
language plpgsql
security definer
set search_path = internal, public, pg_temp
as $$
begin
  update internal.ai_usage_outbox
     set event_id = p_event_id
   where id = p_id
     and event_id is null;
  return found;
exception when others then
  return false;
end;
$$;

create or replace function public.ai_usage_outbox_mark_processed(p_id uuid)
returns void
language sql
security definer
set search_path = internal, public, pg_temp
as $$
  update internal.ai_usage_outbox
     set processed_at = now()
   where id = p_id;
$$;

create or replace function public.ai_usage_outbox_increment_attempts(p_id uuid)
returns void
language sql
security definer
set search_path = internal, public, pg_temp
as $$
  update internal.ai_usage_outbox
     set tentativas = tentativas + 1
   where id = p_id;
$$;

-- ACL das RPCs: postgres é o dono; só service_role executa pelo PostgREST.
revoke all on function public.ai_usage_outbox_enqueue(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.ai_usage_outbox_pending(integer) from public, anon, authenticated;
revoke all on function public.ai_usage_outbox_reserve_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ai_usage_outbox_mark_processed(uuid) from public, anon, authenticated;
revoke all on function public.ai_usage_outbox_increment_attempts(uuid) from public, anon, authenticated;
grant execute on function public.ai_usage_outbox_enqueue(uuid, jsonb, text) to service_role;
grant execute on function public.ai_usage_outbox_pending(integer) to service_role;
grant execute on function public.ai_usage_outbox_reserve_event(uuid, uuid) to service_role;
grant execute on function public.ai_usage_outbox_mark_processed(uuid) to service_role;
grant execute on function public.ai_usage_outbox_increment_attempts(uuid) to service_role;
