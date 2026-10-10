-- Log canônico de mudanças do agente Hermes (.soul §10.2)
-- Criado via db_apply_migration em 2026-09-03 (version 20260903135434, ledger conferido).
-- Registro das runs da sessão de 03/09/2026: import áudios meme V1→V2, PR #175
-- (conversão MP3 client-side), criação deste próprio log.

create schema if not exists ops;

create table if not exists ops.hermes_change_log (
  id              bigserial primary key,
  run_id          uuid        not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  origem          text        not null,               -- slack | cli | api | cron | desktop
  solicitante     text,
  pedido          text        not null,
  status          text        not null default 'planejado',
    -- planejado|revisado|reprovado|simulado|executado|verificado|revertido|falhou
  risco           text,                               -- baixo | medio | alto
  alvos           text[],
  planner_model   text,
  reviewer_model  text,
  executor_model  text,
  plano           jsonb,
  parecer         jsonb,
  simulacao       jsonb,
  execucao        jsonb,
  verificacao     jsonb,
  rollback        text,
  repo            text,
  branch          text,
  commit_sha      text,
  pr_url          text,
  custo_usd       numeric(10,4),
  erro            text
);

alter table ops.hermes_change_log enable row level security;

drop policy if exists service_role_full_hermes_change_log on ops.hermes_change_log;
create policy service_role_full_hermes_change_log on ops.hermes_change_log
  for all to service_role using (true) with check (true);

create index if not exists idx_hermes_change_log_run     on ops.hermes_change_log (run_id);
create index if not exists idx_hermes_change_log_created on ops.hermes_change_log (created_at desc);
create index if not exists idx_hermes_change_log_status  on ops.hermes_change_log (status);
