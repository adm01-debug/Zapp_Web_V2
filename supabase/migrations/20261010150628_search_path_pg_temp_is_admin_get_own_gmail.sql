-- search_path_pg_temp_is_admin_get_own_gmail
-- Rollback: devolve search_path = public as duas funcoes (valor vigente antes desta migration) e reafirma os mesmos REVOKE/GRANT canonicos.
-- Rollback (SQL executável, na ordem):
--   alter function public.is_admin_or_supervisor(uuid) set search_path = public;
--   alter function public.get_own_gmail_accounts() set search_path = public;
--   revoke execute on function public.is_admin_or_supervisor(uuid) from public, anon;
--   grant execute on function public.is_admin_or_supervisor(uuid) to authenticated;
--   revoke execute on function public.get_own_gmail_accounts() from public, anon;
--   grant execute on function public.get_own_gmail_accounts() to authenticated;
--
-- SEC-RLS_TAREFAS_EMAIL_LIGACOES-07 (P1 · seguranca): o audit adversarial encontrou duas
-- funcoes SECURITY DEFINER com `SET search_path = public` — sem `pg_temp`:
--
--   1. public.is_admin_or_supervisor(uuid) — usada nas policies RLS de user_roles,
--      profiles e em ramos de autorizacao (admin/supervisor).
--   2. public.get_own_gmail_accounts() — fallback do front quando a edge gmail-oauth
--      falha (action list-accounts); devolve as contas de e-mail do proprio chamador.
--
-- Quando `search_path` nao cita `pg_temp` explicitamente, o PostgreSQL insere `pg_temp`
-- IMPLICITAMENTE na frente da busca de relacoes dentro da funcao. Uma funcao SECURITY
-- DEFINER com `search_path = public` fica entao sujeita a shadowing de nome nao
-- qualificado por uma tabela temporaria criada pelo chamador. Ambas as funcoes hoje
-- qualificam `public.user_roles` / `public.gmail_accounts`, mas o padrao do repositorio
-- e declarar `pg_temp` de forma explicita (132 migrations ja o fazem) para que qualquer
-- manutencao futura do corpo nao reabra a brecha. Alem disso a forma explicita remove a
-- ambiguidade do lookup para relacoes, tipos e operadores.
--
-- A correcao troca SOMENTE a configuracao search_path (ALTER FUNCTION), sem tocar o corpo
-- das funcoes nem a assinatura — logo o contrato de retorno e o ACL permanecem. Os
-- REVOKE/GRANT abaixo reafirmam o estado canonico das RPCs SECURITY DEFINER (sem EXECUTE
-- para PUBLIC/anon; EXECUTE so para authenticated).

ALTER FUNCTION public.is_admin_or_supervisor(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_own_gmail_accounts() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_own_gmail_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_gmail_accounts() TO authenticated;
