-- ia_timeout_001_outbox_acl
-- Rollback: grant all on public.ai_usage_outbox to anon; grant all on public.ai_usage_outbox to authenticated;

-- IA-TIMEOUT-001 — endurecimento de ACL da outbox do log essencial.
--
-- Por que esta migration existe:
--   `ai_usage_outbox` é fila INTERNA de edge function: nenhum usuário final
--   (anon ou authenticated) deve lê-la ou escrevê-la. A first migration já liga
--   a RLS com política só para service_role — mas RLS é a trava de LINHA, e o
--   GRANT é a trava de TABELA. Aqui as duas ficam explícitas: o papel anônimo e
--   o autenticado perdem o GRANT (não chegam nem a avaliar a RLS) e o
--   service_role recebe o GRANT explícito, que é o caminho legítimo (edge
--   functions com a service role key).
--
-- Idempotente: `revoke`/`grant` podem rodar de novo sem efeito e sem erro.
-- Não altera estrutura; só ACL de uma tabela que ESTA tarefa criou.

alter table public.ai_usage_outbox enable row level security;

revoke all on public.ai_usage_outbox from public;
revoke all on public.ai_usage_outbox from anon;
revoke all on public.ai_usage_outbox from authenticated;
grant all on public.ai_usage_outbox to service_role;
