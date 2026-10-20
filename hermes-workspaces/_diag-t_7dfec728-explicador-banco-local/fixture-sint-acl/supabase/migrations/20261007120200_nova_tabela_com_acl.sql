-- Rollback: reactivar os grants padrao da tabela.
-- Fixture minima: MESMA tabela nova, mas a migration JA diz o que faz com cada papel.
create table if not exists public.nova_tabela (
  id uuid not null default gen_random_uuid() primary key,
  nome text not null
);
alter table public.nova_tabela enable row level security;
revoke all on public.nova_tabela from anon;
revoke all on public.nova_tabela from authenticated;
grant all on public.nova_tabela to service_role;
