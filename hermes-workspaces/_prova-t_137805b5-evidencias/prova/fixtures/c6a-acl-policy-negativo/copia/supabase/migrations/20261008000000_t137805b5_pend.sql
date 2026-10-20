-- t137805b5_pend + policy pol_certa
-- Rollback: drop policy if exists pol_certa on public.t137805b5_pend; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
alter table public.t137805b5_pend enable row level security;
create policy pol_certa on public.t137805b5_pend for select to authenticated using (true);
