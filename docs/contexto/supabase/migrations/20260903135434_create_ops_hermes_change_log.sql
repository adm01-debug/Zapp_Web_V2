create schema if not exists ops;
create table if not exists ops.hermes_change_log (
  id bigserial primary key, run_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(), finished_at timestamptz,
  origem text not null, solicitante text, pedido text not null,
  status text not null default 'planejado', risco text, alvos text[],
  planner_model text, reviewer_model text, executor_model text,
  plano jsonb, parecer jsonb, simulacao jsonb, execucao jsonb, verificacao jsonb,
  rollback text, repo text, branch text, commit_sha text, pr_url text,
  custo_usd numeric(10,4), erro text);
alter table ops.hermes_change_log enable row level security;
drop policy if exists service_role_full_hermes_change_log on ops.hermes_change_log;
create policy service_role_full_hermes_change_log on ops.hermes_change_log
  for all to service_role using (true) with check (true);
create index if not exists idx_hermes_change_log_run on ops.hermes_change_log (run_id);
create index if not exists idx_hermes_change_log_created on ops.hermes_change_log (created_at desc);
create index if not exists idx_hermes_change_log_status on ops.hermes_change_log (status);
