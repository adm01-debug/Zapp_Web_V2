-- lgpd_requests
-- Rollback: a migration so cria objetos novos; derruba a tabela data_deletion_requests (leva junto
-- Rollback (policies, trigger, indices e GRANTs) e as duas funcoes. audit_logs e intocado.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.register_privacy_policy_viewed();
--   drop function if exists public.my_privacy_history(integer);
--   drop table if exists public.data_deletion_requests;
--
-- LGPD (paridade V3 -> V2, doc 01-frontend da V3):
--   O pedido de exclusao da V2 so chamava log_audit_event: nao havia fila, entao o
--   "admin processa em 30 dias" nao tinha onde acontecer. E o titular nao via o proprio
--   historico de privacidade (audit_logs e admin-only).
--   Esta migration e ADITIVA e cria:
--     1. public.data_deletion_requests — a fila de pedidos de exclusao. O titular ve e
--        cria os seus; admin e supervisor (is_admin_or_supervisor -> user_roles) veem e
--        tratam todos. Status identico ao da V3: pending/processing/completed/failed.
--        DELETE nao e concedido a ninguem pela API (default deny): o pedido e trilha de
--        compliance e nao se apaga.
--     2. public.my_privacy_history(p_pagina) — historico do PROPRIO usuario (SECURITY
--        DEFINER porque audit_logs e admin-only), devolvendo so acao e data, paginado
--        de 20 em 20. Nunca devolve details/entity de terceiros.
--     3. public.register_privacy_policy_viewed() — registra o evento
--        'privacy_policy_viewed' para o usuario logado (audit_logs so aceita INSERT de
--        service_role, por isso a funcao DEFINER). Sem dado pessoal no evento.
--   Nenhuma tabela existente e tocada; nenhum GRANT existente e alterado.

-- ============================================================================
-- 1. Fila de pedidos de exclusao
-- ============================================================================

create table if not exists public.data_deletion_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  motivo      text not null,
  status      text not null default 'pending',
  prazo       timestamptz not null default (now() + interval '30 days'),
  tratado_por uuid references auth.users (id) on delete set null,
  tratado_em  timestamptz,
  resposta    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint data_deletion_requests_motivo_check
    check (char_length(btrim(motivo)) between 1 and 1000),
  constraint data_deletion_requests_status_check
    check (status in ('pending', 'processing', 'completed', 'failed'))
);

comment on table public.data_deletion_requests is
  'LGPD: fila de pedidos de exclusao de dados. Titular cria/ve os proprios; admin e supervisor tratam. Status: pending/processing/completed/failed.';
comment on column public.data_deletion_requests.prazo is
  'Prazo de tratamento: criado + 30 dias.';
comment on column public.data_deletion_requests.tratado_por is
  'Quem tratou o pedido (admin/supervisor); preenchido no UPDATE da fila.';

create index if not exists idx_data_deletion_requests_user
  on public.data_deletion_requests (user_id, created_at desc);
create index if not exists idx_data_deletion_requests_status
  on public.data_deletion_requests (status, prazo);

drop trigger if exists set_data_deletion_requests_updated_at on public.data_deletion_requests;
create trigger set_data_deletion_requests_updated_at
  before update on public.data_deletion_requests
  for each row execute function public.update_updated_at_column();

alter table public.data_deletion_requests enable row level security;

drop policy if exists data_deletion_requests_select on public.data_deletion_requests;
create policy data_deletion_requests_select on public.data_deletion_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin_or_supervisor((select auth.uid()))
  );

drop policy if exists data_deletion_requests_insert on public.data_deletion_requests;
create policy data_deletion_requests_insert on public.data_deletion_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists data_deletion_requests_update on public.data_deletion_requests;
create policy data_deletion_requests_update on public.data_deletion_requests
  for update to authenticated
  using (public.is_admin_or_supervisor((select auth.uid())))
  with check (public.is_admin_or_supervisor((select auth.uid())));

revoke all on table public.data_deletion_requests from public, anon;
grant select, insert, update on table public.data_deletion_requests to authenticated;
grant select, insert, update, delete on table public.data_deletion_requests to service_role;

-- ============================================================================
-- 2. Historico de privacidade do proprio usuario
-- ============================================================================

create or replace function public.my_privacy_history(p_pagina integer default 1)
returns table (action text, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.action, a.created_at
    from public.audit_logs a
   where a.user_id = auth.uid()
   order by a.created_at desc, a.id desc
   limit 20
  offset (greatest(coalesce(p_pagina, 1), 1) - 1) * 20
$$;

comment on function public.my_privacy_history(integer) is
  'LGPD: acoes (action, created_at) do proprio usuario em audit_logs, 20 por pagina. Nunca devolve details/entity de terceiros.';

revoke all on function public.my_privacy_history(integer) from public, anon;
grant execute on function public.my_privacy_history(integer) to authenticated;

-- ============================================================================
-- 3. Registro de visualizacao da politica de privacidade
-- ============================================================================

create or replace function public.register_privacy_policy_viewed()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.audit_logs (user_id, action, entity_type)
  values (auth.uid(), 'privacy_policy_viewed', 'privacy');
end;
$$;

comment on function public.register_privacy_policy_viewed() is
  'LGPD: registra o evento privacy_policy_viewed para o usuario logado em audit_logs (sem dado pessoal).';

revoke all on function public.register_privacy_policy_viewed() from public, anon;
grant execute on function public.register_privacy_policy_viewed() to authenticated;
