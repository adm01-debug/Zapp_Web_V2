-- ia_timeout_001_event_id_outbox
-- Rollback: drop table if exists public.ai_usage_outbox; drop index if exists public.ai_usage_logs_event_id_uidx; alter table public.ai_usage_logs drop column if exists event_id;

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
--   2. uma OUTBOX durável (`ai_usage_outbox`): falha do insert — ou de qualquer
--      passo antes/depois dele — fica PENDENTE no banco até o reprocessamento
--      (`reprocessarOutboxDeLog`) confirmar a entrega.
--
-- Natureza: ADITIVA e IDEMPOTENTE. Coluna nova anulável, índices e tabela
-- novos; sem backfill (linhas antigas ficam com `event_id` NULL — não havia
-- identidade de evento a preservar). Sem `CONCURRENTLY` (convenção do projeto:
-- migrations rodam em transação).

alter table public.ai_usage_logs
  add column if not exists event_id uuid;

-- A unicidade é do BANCO (não de um SELECT anterior ao insert). O índice único
-- arbitra o `ON CONFLICT (event_id)` e admite os NULLs das linhas antigas.
create unique index if not exists ai_usage_logs_event_id_uidx
  on public.ai_usage_logs (event_id);

-- Outbox: fila durável das falhas do log essencial.
--  - event_id: a mesma identidade do evento; NULL quando a falha aconteceu
--    ANTES da identidade ser gerada (o reprocessamento reserva e GRAVA uma
--    antes de enviar);
--  - payload: `{linha}` pronta para reenvio, ou `{entrada}` para remontar;
--  - processed_at: NULL = pendente; preenchido = entrega confirmada.
create table if not exists public.ai_usage_outbox (
  id uuid not null default gen_random_uuid() primary key,
  event_id uuid,
  payload jsonb not null,
  motivo text not null,
  tentativas integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- O mesmo evento falha uma vez só na fila (NULLs nunca conflitam entre si).
create unique index if not exists ai_usage_outbox_event_id_uidx
  on public.ai_usage_outbox (event_id);

-- O reprocessamento varre só os pendentes, do mais antigo ao mais novo.
create index if not exists idx_ai_usage_outbox_pendentes
  on public.ai_usage_outbox (created_at)
  where processed_at is null;

alter table public.ai_usage_outbox enable row level security;

-- `ai_usage_outbox` é fila INTERNA de edge function: nenhum usuário final
-- (anon ou authenticated) a lê ou escreve. A RLS é a trava de LINHA; o GRANT é
-- a trava de TABELA — aqui as duas ficam explícitas, no mesmo desenho de
-- `ai_usage_logs` (escrita/leitura só via service_role).
drop policy if exists "Service role manages ai usage outbox" on public.ai_usage_outbox;
create policy "Service role manages ai usage outbox"
  on public.ai_usage_outbox
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.ai_usage_outbox from public;
revoke all on public.ai_usage_outbox from anon;
revoke all on public.ai_usage_outbox from authenticated;
grant all on public.ai_usage_outbox to service_role;
