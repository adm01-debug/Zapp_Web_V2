-- ia_timeout_001_event_id_outbox
-- Rollback: drop table if exists public.ai_usage_outbox; drop index if exists public.ai_usage_logs_event_id_uidx; alter table public.ai_usage_logs drop column if exists event_id;

-- IA-TIMEOUT-001 — identidade única por evento + outbox durável.
--
-- Por que esta migration existe:
--   O log essencial (`ai_usage_logs`) precisa de duas garantias que o schema
--   não tinha:
--   1. UMA identidade por evento (`event_id`, uuid gerado no produtor, sem
--      derivar do conteúdo) imposta por restrição de unicidade — é ela que
--      faz o `INSERT ... ON CONFLICT (event_id) DO NOTHING` do logger absorver
--      reentrega sem consulta prévia (consultar-antes-de-inserir admite
--      corrida) e sem colapsar consumos legítimos idênticos;
--   2. Uma OUTBOX durável (`ai_usage_outbox`): falha do insert — ou de
--      qualquer passo antes/depois dele — fica PENDENTE no banco até o
--      reprocessamento (`reprocessarOutboxDeLog`) confirmar a entrega.
--
-- Escopo: SÓ schema funcional. ACL/privilégios (RLS, policy, GRANT/REVOKE por
-- papel) ficam na migration `20261005190058_ia_timeout_001_outbox_acl.sql`.
--
-- Natureza: ADITIVA e IDEMPOTENTE. Coluna nova nullable, índice e tabela
-- novos; sem backfill (linhas antigas ficam com event_id NULL — não havia
-- identidade de evento a preservar). Sem `CONCURRENTLY` (convenção do
-- projeto: migrations rodam em transação).

alter table public.ai_usage_logs
  add column if not exists event_id uuid;

-- A unicidade é do BANCO (não de um SELECT anterior ao insert). Índice único
-- serve de árbitro do ON CONFLICT (event_id) e admite os NULLs das linhas
-- antigas.
create unique index if not exists ai_usage_logs_event_id_uidx
  on public.ai_usage_logs (event_id);

-- Outbox: fila durável das falhas do log essencial.
--  - event_id: a mesma identidade do evento; NULL quando a falha aconteceu
--    antes da identidade ser gerada (o reprocessamento cria uma);
--  - payload: {linha} pronta para reenvio, ou {entrada} para remontar;
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

-- O mesmo evento falha uma vez só na fila (NULLs nunca conflitam).
create unique index if not exists ai_usage_outbox_event_id_uidx
  on public.ai_usage_outbox (event_id);

-- A leitura do reprocessamento varre só os pendentes, do mais antigo ao mais novo.
create index if not exists idx_ai_usage_outbox_pendentes
  on public.ai_usage_outbox (created_at)
  where processed_at is null;
