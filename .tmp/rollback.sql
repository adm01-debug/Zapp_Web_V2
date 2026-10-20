-- prova do rollback (linha 4 da migration) no banco local da tarefa
\set ON_ERROR_STOP on
DROP FUNCTION IF EXISTS public.admin_unlock_login(text);
SELECT to_regprocedure('public.admin_unlock_login(text)') IS NULL AS removida;
