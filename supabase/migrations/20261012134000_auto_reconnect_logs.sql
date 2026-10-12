-- auto_reconnect_logs
-- Rollback: restaura a view public.whatsapp_connections_safe SEM health_reason, remove a tabela
--           public.reconnection_logs (nova, criada aqui: nao ha dado anterior a devolver),
--           os 4 check constraints e as 4 colunas novas de whatsapp_connections e desagenda o job
--           de retencao. Nenhum GRANT/papel pre-existente muda.
-- Rollback (SQL executável, na ordem):
--   do $rb$ begin if exists (select 1 from pg_namespace where nspname = 'cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'reconnection-logs-retention-30d'; end if; end $rb$;
--   drop view if exists public.whatsapp_connections_safe;
--   create view public.whatsapp_connections_safe with (security_invoker = true) as select id, name, phone_number, status, is_default, case when public.has_role(auth.uid(), 'admin') then qr_code else null end as qr_code, case when public.has_role(auth.uid(), 'admin') then instance_id else null end as instance_id, farewell_message, farewell_enabled, battery_level, is_plugged, retry_count, max_retries, last_health_check, health_status, health_response_ms, created_by, created_at, updated_at from public.whatsapp_connections;
--   grant select on public.whatsapp_connections_safe to authenticated;
--   drop table if exists public.reconnection_logs;
--   alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_reconnect_interval_seconds_check;
--   alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_reconnect_max_attempts_check;
--   alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_health_reason_check;
--   alter table public.whatsapp_connections drop column if exists health_reason;
--   alter table public.whatsapp_connections drop column if exists reconnect_max_attempts;
--   alter table public.whatsapp_connections drop column if exists reconnect_interval_seconds;
--   alter table public.whatsapp_connections drop column if exists auto_reconnect_enabled;
--
-- feat(db): auto-reconexao de conexoes WhatsApp — politica por conexao, motivo de saude e
-- historico de tentativas (reconnection_logs) com RLS de staff e retencao de 30 dias.
-- Paridade V3->V2 (cartao de conexao: auto-reconnect, motivo de saude e historico de tentativas).
-- Migration ADITIVA: nenhuma linha existente precisa de backfill (colunas nullable ou com DEFAULT).
--
-- DECISOES MEDIDAS NO REPO (nao assumidas):
--  1. Conexao = public.whatsapp_connections (20260319134046): ja tem status, retry_count, max_retries,
--     last_health_check, health_status, health_response_ms. As colunas novas entram ao lado dessas.
--  2. Staff = public.is_admin_or_supervisor(auth.uid()) (20251215025014) e admin = public.is_admin(auth.uid()),
--     o mesmo par usado pelo modulo de conexoes (20260401000835, 20260411111648) e pelo gate de escritas
--     (20260830150000_gate16_admin_only_write_policies.sql). Assinatura real: is_admin_or_supervisor(_user_id uuid).
--  3. Leitura operacional = public.whatsapp_connections_safe (20260410105209, security_invoker = true),
--     que ja mascara qr_code/instance_id para nao-admin. health_reason e exposta porque nao e segredo
--     (texto curto, ex.: "instancia nao responde") e e o dado que o cartao de conexao precisa mostrar.
--  4. Escrita do log e de SISTEMA (Edge function com service_role, que ignora RLS): NAO criamos policy de
--     INSERT/UPDATE/DELETE para authenticated. O historico de tentativas e trilha de auditoria e nao se
--     forja de dentro do app — negar por padrao.
--  5. Retencao: job pg_cron diario apagando o que passar de 30 dias (padrao do repo:
--     20260905020000_edge_rate_limits.sql). O agendamento e guardado por pg_namespace para a migration
--     poder ser aplicada/verificada em Postgres descartavel sem pg_cron.
--  6. Escopo: nada de DROP/TRUNCATE/DELETE de dado existente; nenhum GRANT de objeto existente e tocado.

-- 1. Politica de auto-reconexao e motivo de saude, por conexao (aditivas).
alter table public.whatsapp_connections
  add column if not exists auto_reconnect_enabled boolean not null default true,
  add column if not exists reconnect_interval_seconds integer not null default 60,
  add column if not exists reconnect_max_attempts integer not null default 3,
  add column if not exists health_reason text;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_reconnect_interval_seconds_check;
alter table public.whatsapp_connections
  add constraint whatsapp_connections_reconnect_interval_seconds_check
  check (reconnect_interval_seconds between 60 and 3600);

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_reconnect_max_attempts_check;
alter table public.whatsapp_connections
  add constraint whatsapp_connections_reconnect_max_attempts_check
  check (reconnect_max_attempts between 1 and 20);

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_health_reason_check;
alter table public.whatsapp_connections
  add constraint whatsapp_connections_health_reason_check
  check (health_reason is null or char_length(btrim(health_reason)) between 1 and 200);

comment on column public.whatsapp_connections.auto_reconnect_enabled is
  'Se true, a conexao pode ser reconectada automaticamente apos cair.';
comment on column public.whatsapp_connections.reconnect_interval_seconds is
  'Intervalo minimo entre tentativas de reconexao, em segundos (60..3600).';
comment on column public.whatsapp_connections.reconnect_max_attempts is
  'Numero maximo de tentativas de reconexao por queda antes de desistir (1..20).';
comment on column public.whatsapp_connections.health_reason is
  'Motivo curto do estado de saude (texto, ate 200 caracteres). Nulo quando nao ha motivo a informar.';

-- 2. A view operacional passa a expor health_reason (coluna acrescentada no FIM: as anteriores e o
--    mascaramento de qr_code/instance_id continuam identicos).
create or replace view public.whatsapp_connections_safe
with (security_invoker = true) as
select
  id, name, phone_number, status, is_default,
  case when public.has_role(auth.uid(), 'admin') then qr_code else null end as qr_code,
  case when public.has_role(auth.uid(), 'admin') then instance_id else null end as instance_id,
  farewell_message, farewell_enabled, battery_level, is_plugged,
  retry_count, max_retries, last_health_check, health_status, health_response_ms,
  created_by, created_at, updated_at,
  health_reason
from public.whatsapp_connections;

-- 3. Historico de tentativas de reconexao (nova tabela).
create table if not exists public.reconnection_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  attempt integer not null,
  result text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint reconnection_logs_attempt_check check (attempt >= 1),
  constraint reconnection_logs_result_check check (result in ('success', 'failure', 'skipped')),
  constraint reconnection_logs_reason_check check (reason is null or char_length(reason) <= 200)
);

comment on table public.reconnection_logs is
  'Historico das tentativas de reconexao por conexao. Escrito pelo sistema (service_role); retencao de 30 dias.';

create index if not exists reconnection_logs_connection_created_idx
  on public.reconnection_logs (connection_id, created_at desc);
create index if not exists reconnection_logs_created_at_idx
  on public.reconnection_logs (created_at);

-- 4. RLS: leitura para staff; escrita so do sistema (service_role ignora RLS) — negar por padrao.
alter table public.reconnection_logs enable row level security;

drop policy if exists "Staff can view reconnection logs" on public.reconnection_logs;
create policy "Staff can view reconnection logs"
  on public.reconnection_logs
  for select
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

revoke all on table public.reconnection_logs from public;
revoke all on table public.reconnection_logs from anon;
revoke insert, update, delete, truncate, references, trigger on table public.reconnection_logs from authenticated;
grant select on table public.reconnection_logs to authenticated;
grant all on table public.reconnection_logs to service_role;

-- 5. Retencao de 30 dias (guardada: em Postgres descartavel sem pg_cron a migration nao falha).
do $guard$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'reconnection-logs-retention-30d',
      '30 4 * * *',
      $job$delete from public.reconnection_logs where created_at < now() - interval '30 days'$job$
    );
  end if;
end
$guard$;
