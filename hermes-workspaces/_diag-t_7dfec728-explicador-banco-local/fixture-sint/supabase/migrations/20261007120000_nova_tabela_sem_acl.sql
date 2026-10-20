-- Rollback: drop table if exists public.nova_tabela;
-- Migration pendente MINIMA e SINTETICA: cria a tabela, sem GRANT/REVOKE/policy
-- (e exatamente o que um cartao de tabela nova costuma deixar de fora).
create table if not exists public.nova_tabela (
  id uuid not null default gen_random_uuid() primary key,
  nome text not null
);
alter table public.nova_tabela enable row level security;
