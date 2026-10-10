-- Rollback: drop table if exists public.cartao_novo;
-- Migration PENDENTE do cartao (fixture). Cria a tabela do cartao e, por SQL dinamico, uma
-- tabela/coluna cujos NOMES sao montados em tempo de execucao: nenhum deles aparece literalmente
-- neste texto. E o drift novo que NAO existe no retrato canonico nem em versao ja aplicada.
create table if not exists public.cartao_novo (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb
);
alter table public.cartao_novo enable row level security;
grant select on public.cartao_novo to authenticated;
do $do$
declare
  t text := 'cartao_' || 'dinamico';
  c text := 'coluna_' || 'gerada';
begin
  execute format('create table if not exists public.%I (%I text)', t, c);
end
$do$;
do $do$
begin
  execute format('alter table %I add column %I text', 'cartao_novo', 'coluna_' || 'injetada');
end
$do$;
