alter table public.conversation_tasks    add column if not exists client_task_id uuid

alter table public.conversation_analyses add column if not exists request_key    text

alter table public.notifications         add column if not exists dedupe_key     text

create unique index if not exists ux_conversation_tasks_creator_client_key
  on public.conversation_tasks (created_by, client_task_id)
  where client_task_id is not null and created_by is not null

create unique index if not exists ux_conversation_analyses_contact_request_key
  on public.conversation_analyses (contact_id, request_key)
  where request_key is not null

create unique index if not exists ux_notifications_user_dedupe_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null

comment on column public.conversation_tasks.client_task_id is
  'IA-047: chave idempotente do clique de criação de tarefa (ux_conversation_tasks_creator_client_key: created_by+client_task_id único, parcial).'

comment on column public.conversation_analyses.request_key is
  'IA-047: chave idempotente do pedido de análise (ux_conversation_analyses_contact_request_key: contact_id+request_key único, parcial).'

comment on column public.notifications.dedupe_key is
  'IA-047: chave idempotente do aviso (ux_notifications_user_dedupe_key: user_id+dedupe_key único, parcial).'

create table if not exists public.talkx_test_send_claims (
  id                  uuid primary key default gen_random_uuid(),
  request_key         text not null unique,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
)

alter table public.talkx_test_send_claims enable row level security

revoke all on table public.talkx_test_send_claims from public, anon, authenticated

grant all on table public.talkx_test_send_claims to service_role

comment on table public.talkx_test_send_claims is
  'IA-047: claim durável do envio de TESTE do Talk X. request_key UNIQUE => repetir o mesmo pedido NÃO refaz o POST ao provedor; provider_message_id preenchido libera a resposta idempotente.'

do $$
declare
  v_faltando text;
begin
  select string_agg(esperado.nome, ', ') into v_faltando
    from (values
      ('ux_conversation_tasks_creator_client_key'),
      ('ux_conversation_analyses_contact_request_key'),
      ('ux_notifications_user_dedupe_key')
    ) as esperado(nome)
   where not exists (
     select 1
       from pg_indexes
      where schemaname = 'public'
        and indexname = esperado.nome
   );

  if v_faltando is not null then
    raise exception 'ia047_indices_de_idempotencia_ausentes: %', v_faltando;
  end if;
end;
$$
