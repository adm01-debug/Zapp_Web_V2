-- Rollback: drop table if exists public.nova_tabela;
-- Fixture minima para isolar nome de POLICY: a migration cria a policy com nome
-- entre aspas, como faz a migration do cartao ("Service role can manage AI usage outbox").
create table if not exists public.nova_tabela (
  id uuid not null default gen_random_uuid() primary key
);
alter table public.nova_tabela enable row level security;
create policy "pol_leitura" on public.nova_tabela for select to authenticated using (true);
