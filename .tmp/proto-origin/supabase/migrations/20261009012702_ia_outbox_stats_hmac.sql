-- ia_outbox_stats_hmac
-- Rollback: a migration só CRIA objeto novo (a tabela public.outbox_events); derrubá-la desfaz tudo — o índice, as constraints, a policy, os GRANTs e os comentários morrem com a tabela.
-- Rollback (SQL executável, na ordem):
--   drop table if exists public.outbox_events;
--
-- Item 090 (fatia de banco SL-195c1) — estrutura LOCAL para registrar eventos de
-- integração que ficaram SEM CONFIRMAÇÃO, junto da ASSINATURA HMAC-SHA256 do payload.
--
-- Por que existe: hoje a ponta só deduplica webhook por índice único em `messages` e
-- não tem onde guardar um evento cujo efeito externo não foi confirmado (retry,
-- replay, entrega tardia). A linha pendente precisa de (a) chave de idempotência
-- estável da origem, (b) o payload íntegro, (c) a assinatura que o produtor mandou,
-- (d) estado de entrega (pendente x confirmada) e (e) contador de tentativas.
--
-- Por que NÃO reaproveita o que já existe:
--   * `ai_usage_outbox` (item 44, outra trilha) é a fila de ENTREGA do log essencial
--     de IA: o payload dela é a linha de `ai_usage_logs`, sem origem, sem chave de
--     evento, sem assinatura e sem tipo; o único consumidor é `_shared/ai-usage.ts`.
--     Esta tabela é a outbox GENÉRICA de evento de integração (base para o 084 e para
--     integrações futuras), com contrato de colunas diferente de propósito — reusar a
--     fila do log de IA misturaria dois consumidores e duas semânticas de baixa.
--   * `webhook_failures` (E35) é dead-letter de FALHA de processamento (estado
--     terminal, `retry_count` + `resolved`), não fila de pendência com baixa.
--
-- Onde fica a criptografia: aqui mora só o ENVELOPE assinado. A verificação do HMAC
-- (Web Crypto, a rotina que já existe em `_shared/hmac-validation.ts`) roda na Edge
-- Function ANTES de gravar: segredo compartilhado não mora no banco, e reimplementar
-- a rotina em PL/pgSQL criaria uma segunda implementação para divergir. O que o banco
-- garante é que nenhum evento entra sem assinatura HMAC-SHA256 bem formada (CHECK
-- abaixo) e que o mesmo evento da mesma origem não entra duas vezes (UNIQUE abaixo).
--
-- Natureza: ADITIVA e IDEMPOTENTE (`create ... if not exists`, `drop policy if
-- exists`), sem backfill e sem tocar nenhuma tabela, coluna ou função existente.
-- Sem `concurrently` (a migration roda em transação única). O dono da tabela é o papel
-- que roda as migrations: os privilégios de dono são implícitos e não são concedidos a
-- mais ninguém abaixo.

create table if not exists public.outbox_events (
  id           uuid        not null default gen_random_uuid() primary key,
  origem       text        not null,
  event_id     text        not null,
  tipo         text        not null,
  payload      jsonb       not null,
  assinatura   text        not null,
  algoritmo    text        not null default 'sha256',
  tentativas   integer     not null default 0,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  constraint outbox_events_origem_event_id_unico unique (origem, event_id),
  constraint outbox_events_origem_nao_vazia check (btrim(origem) <> ''),
  constraint outbox_events_event_id_nao_vazio check (btrim(event_id) <> ''),
  constraint outbox_events_tipo_nao_vazio check (btrim(tipo) <> ''),
  constraint outbox_events_payload_documento check (jsonb_typeof(payload) in ('object', 'array')),
  constraint outbox_events_assinatura_hmac check (assinatura ~ '^(sha256=)?[0-9a-f]{64}$'),
  constraint outbox_events_algoritmo_sha256 check (algoritmo = 'sha256'),
  constraint outbox_events_tentativas_nao_negativas check (tentativas >= 0)
);

-- A fila lê só as linhas PENDENTES e na ordem de chegada; o índice é parcial para
-- não crescer com o histórico já confirmado.
create index if not exists idx_outbox_events_pendentes
  on public.outbox_events (created_at)
  where processed_at is null;

comment on table public.outbox_events is
  'Outbox genérica de eventos de integração (item 090). Pendente = processed_at is null; a assinatura HMAC-SHA256 do payload é verificada na Edge Function antes de gravar.';
comment on column public.outbox_events.origem is
  'Produtor do evento (ex.: n8n, evolution-go, ai-proxy). Com event_id forma a chave de idempotência.';
comment on column public.outbox_events.event_id is
  'Identificador estável do evento NA ORIGEM. Idempotência: unique (origem, event_id).';
comment on column public.outbox_events.assinatura is
  'HMAC-SHA256 do payload, em hex minúsculo, com ou sem o prefixo sha256=. O formato é conferido por CHECK.';
comment on column public.outbox_events.processed_at is
  'NULL = evento ainda NÃO confirmado. Preenchido = baixa dada depois da confirmação.';

-- Fila interna: nem anon nem authenticated leem ou escrevem; o acesso é do
-- service_role — mesmo desenho de `ai_usage_logs` e de `webhook_failures`.
-- A RLS é a trava de LINHA; o REVOKE/GRANT é a trava de TABELA.
alter table public.outbox_events enable row level security;

drop policy if exists outbox_events_service_role on public.outbox_events;
create policy outbox_events_service_role
  on public.outbox_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.outbox_events from public;
revoke all on public.outbox_events from anon;
revoke all on public.outbox_events from authenticated;
grant all on public.outbox_events to service_role;
