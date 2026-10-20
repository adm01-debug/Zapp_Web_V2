-- t137805b5_pend + revoke explicito de papel padrao
-- Rollback: grant all on public.t137805b5_pend to authenticated; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
revoke all on public.t137805b5_pend from authenticated;
