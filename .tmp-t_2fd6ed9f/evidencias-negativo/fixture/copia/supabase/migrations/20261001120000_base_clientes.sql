-- Rollback: drop function if exists public.fn_antiga(); drop table if exists public.clientes;
-- Migration JA APLICADA na base canonica (nao e pendente). Fixture do caso negativo t_2fd6ed9f.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null
);
alter table public.clientes enable row level security;
grant select on public.clientes to authenticated;
create or replace function public.fn_antiga() returns void language sql as $fn$ select 1 $fn$;
