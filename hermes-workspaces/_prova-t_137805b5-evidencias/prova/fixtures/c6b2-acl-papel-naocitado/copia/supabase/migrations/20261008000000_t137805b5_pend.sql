-- t137805b5_pend + grant para outro papel
-- Rollback: revoke all on public.t137805b5_pend from relatorio_role; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
grant select on public.t137805b5_pend to relatorio_role;
