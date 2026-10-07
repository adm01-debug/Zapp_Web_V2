-- ia_timeout_001_outbox_acl
-- Rollback: drop policy if exists "Service role can manage AI usage outbox" on public.ai_usage_outbox; alter table public.ai_usage_outbox disable row level security; revoke select, insert, update, delete on table public.ai_usage_outbox from service_role; grant all on table public.ai_usage_outbox to service_role; revoke all on table public.ai_usage_outbox from anon; revoke all on table public.ai_usage_outbox from authenticated; revoke all on table public.ai_usage_outbox from public;
--
-- Fila INTERNA de edge function: liga RLS com policy FOR ALL so para
-- service_role (sem ela, o service_role NOLOGIN sem BYPASSRLS do Postgres de
-- teste seria barrado pelo proprio RLS; no Supabase ele tem BYPASSRLS e a
-- policy nao atrapalha) e fecha a ACL de tabela. Estado anterior medido no
-- banco local da tarefa: o default privileges do postgres em public da ALL a
-- authenticated e a service_role, logo a ACL era {postgres=ALL,
-- authenticated=ALL, service_role=ALL}, anon/PUBLIC sem privilegio, RLS
-- desligada e zero policies — o defeito. Os REVOKEs sao defensivos e
-- idempotentes (rodar de novo nao muda nada); service_role fica com
-- EXATAMENTE os 4 privilegios que a fila usa, o que da ao rollback um REVOKE
-- real para desfazer: o GRANT ALL seguinte restaura EXATAMENTE o privilegio
-- anterior dele (ALL, medido). postgres (dono) nao e tocado por nenhum dos
-- dois lados. anon, authenticated e PUBLIC NAO sao reconcedidos no rollback —
-- ordem do cartao ("nao conceder privilegio a anon, authenticated ou public
-- no estado final nem no rollback"): o ALL que o default lhes devolveria e o
-- proprio defeito; os 3 REVOKEs finais do rollback o deixam deterministico.

alter table public.ai_usage_outbox enable row level security;
drop policy if exists "Service role can manage AI usage outbox" on public.ai_usage_outbox;
create policy "Service role can manage AI usage outbox"
  on public.ai_usage_outbox for all to service_role using (true) with check (true);
revoke all on table public.ai_usage_outbox from public;
revoke all on table public.ai_usage_outbox from anon;
revoke all on table public.ai_usage_outbox from authenticated;
revoke all on table public.ai_usage_outbox from service_role;
grant select, insert, update, delete on table public.ai_usage_outbox to service_role;
