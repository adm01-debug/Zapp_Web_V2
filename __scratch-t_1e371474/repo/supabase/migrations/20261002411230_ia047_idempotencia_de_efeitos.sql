-- ia047_idempotencia_de_efeitos
-- versão 20261002411230 reservada para hermes-ia-bloco-05-pr4-idempotencia-cancelament-261002065750ac em 2026-10-02T07:07:50-03:00 (hermes-db-migrar --nova)
-- rollback: drop table if exists public.talkx_test_send_claims; drop index if exists public.ux_notifications_user_dedupe_key; drop index if exists public.ux_conversation_analyses_contact_request_key; drop index if exists public.ux_conversation_tasks_creator_client_key; alter table public.notifications drop column if exists dedupe_key; alter table public.conversation_analyses drop column if exists request_key; alter table public.conversation_tasks drop column if exists client_task_id;
--
-- Bloco 05 / PR-4 — IA-047 (Tornar efeitos idempotentes). Classe: aditiva / contrato de dados.
-- Só DDL ADITIVO: três colunas novas NULLABLE, três índices únicos PARCIAIS (com
-- `where <coluna> is not null`) e uma tabela nova de claim do envio de teste. Não há
-- DROP/TRUNCATE/RENAME de objeto vivo nem DML, e todos os CREATE usam `if not exists`,
-- então um replay é inofensivo.
--
-- Por que o índice é PARCIAL: a chave nasce NULA para todo o histórico (a coluna é
-- nova), então nenhuma linha antiga entra no índice — não há risco de colisão nem de
-- a migration falhar por duplicata legada. Só quem grava a chave com uma intenção
-- estável fica sob a constraint:
--   * conversation_tasks.client_task_id   — clique em "criar tarefa" (o front deriva 1x);
--   * conversation_analyses.request_key    — pedido de análise de conversa;
--   * notifications.dedupe_key             — aviso que não pode repetir;
--   * talkx_test_send_claims.request_key   — envio de TESTE do Talk X (claim durável).
-- O par lógico de cada índice está documentado no COMMENT da coluna e o aceite da
-- etapa ("repetir o mesmo pedido não duplica tarefa ou envio") é provado no contrato
-- tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts.
--
-- Segurança: a tabela de claim do teste tem RLS habilitada SEM policy e só service_role
-- acessa (mesma postura de ai_jobs e crm_sync_outbox) — o envio de teste roda na edge.

alter table public.conversation_tasks    add column if not exists client_task_id uuid;
alter table public.conversation_analyses add column if not exists request_key    text;
alter table public.notifications         add column if not exists dedupe_key     text;

-- (a) Tarefa: um mesmo autor não cria duas tarefas com o mesmo `client_task_id`.
create unique index if not exists ux_conversation_tasks_creator_client_key
  on public.conversation_tasks (created_by, client_task_id)
  where client_task_id is not null and created_by is not null;

-- (b) Análise: um mesmo contato não acumula duas análises com a mesma `request_key`.
create unique index if not exists ux_conversation_analyses_contact_request_key
  on public.conversation_analyses (contact_id, request_key)
  where request_key is not null;

-- (c) Aviso: um mesmo usuário não recebe o mesmo aviso duas vezes.
create unique index if not exists ux_notifications_user_dedupe_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

comment on column public.conversation_tasks.client_task_id is
  'IA-047: chave idempotente do clique de criação de tarefa (ux_conversation_tasks_creator_client_key: created_by+client_task_id único, parcial).';
comment on column public.conversation_analyses.request_key is
  'IA-047: chave idempotente do pedido de análise (ux_conversation_analyses_contact_request_key: contact_id+request_key único, parcial).';
comment on column public.notifications.dedupe_key is
  'IA-047: chave idempotente do aviso (ux_notifications_user_dedupe_key: user_id+dedupe_key único, parcial).';

-- Envio de TESTE do Talk X: claim durável por `request_key`. O POST ao provedor só
-- acontece depois de registrar o claim; repetir o mesmo pedido cai na UNIQUE e NÃO
-- reabre o POST (não se presume exactly-once externo — no máximo se garante 1 POST).
create table if not exists public.talkx_test_send_claims (
  id                  uuid primary key default gen_random_uuid(),
  request_key         text not null unique,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

alter table public.talkx_test_send_claims enable row level security;
revoke all on table public.talkx_test_send_claims from public, anon, authenticated;
grant all on table public.talkx_test_send_claims to service_role;

comment on table public.talkx_test_send_claims is
  'IA-047: claim durável do envio de TESTE do Talk X. request_key UNIQUE => repetir o mesmo pedido NÃO refaz o POST ao provedor; provider_message_id preenchido libera a resposta idempotente.';

-- Fail-closed: se algum dos três índices parciais não existir (um CREATE não colou),
-- aborta em vez de deixar o contrato de idempotência pela metade.
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
$$;
