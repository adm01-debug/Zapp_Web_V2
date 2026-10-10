-- search_path_pg_temp_is_admin_get_own_gmail
-- Rollback: recria as duas funcoes com o CORPO ANTERIOR REAL (search_path = public) e reafirma os REVOKE/GRANT canonicos.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.is_admin_or_supervisor(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $function$ select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin', 'supervisor')) $function$;
--   create or replace function public.get_own_gmail_accounts() returns table(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamptz, last_error text, token_expires_at timestamptz, created_at timestamptz, updated_at timestamptz) language sql stable security definer set search_path to 'public' as $function$ select id, user_id, email_address, is_active, sync_status, last_sync_at, last_error, token_expires_at, created_at, updated_at from public.gmail_accounts where user_id = auth.uid() and is_active = true $function$;
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
