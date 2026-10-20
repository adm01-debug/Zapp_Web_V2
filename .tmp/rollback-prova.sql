-- prova de que a linha 4 da migration e um rollback EXECUTAVEL, num PG17 descartavel.
-- Ambiente minimo so para a migration aplicar; depois a linha do rollback roda.
\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.login_attempts (id uuid PRIMARY KEY, email text UNIQUE, attempt_count int, locked_until timestamptz);
CREATE TABLE public.audit_logs (user_id uuid, action text, entity_type text, entity_id uuid, details jsonb);

\echo '── migration aplicada verbatim ──'
\i :mig_dir/20261016005650_admin_unlock_login.sql
SELECT to_regprocedure('public.admin_unlock_login(text)') IS NOT NULL AS criada,
       has_function_privilege('authenticated', 'public.admin_unlock_login(text)', 'EXECUTE') AS autenticado,
       has_function_privilege('anon', 'public.admin_unlock_login(text)', 'EXECUTE') AS anonimo;

\echo '── linha do rollback (`--   drop function if exists public.admin_unlock_login(text);`) ──'
drop function if exists public.admin_unlock_login(text);
SELECT to_regprocedure('public.admin_unlock_login(text)') IS NULL AS removida;
ROLLBACK;
