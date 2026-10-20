\echo '--- B1) SECURITY DEFINER como postgres ---'
CREATE FUNCTION public.nova_fn_sd() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
SELECT p.proname, p.prosecdef, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='nova_fn_sd';
\echo '--- B2) executar nova_fn_sd como anon ---'
SET ROLE anon; SELECT public.nova_fn_sd() AS r; RESET ROLE;

\echo '--- C1) tabela como postgres ---'
CREATE TABLE public.nova_tab(id int);
INSERT INTO public.nova_tab VALUES (10);
SELECT c.relname, c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='nova_tab';
SELECT has_table_privilege('anon','public.nova_tab','SELECT') AS anon_pode_select;
\echo '--- C2) SELECT como anon na tabela nova (postgres) ---'
SET ROLE anon; SELECT count(*) FROM public.nova_tab; RESET ROLE;

\echo '--- D1) funcao e tabela criadas por supabase_admin ---'
SET ROLE supabase_admin;
CREATE FUNCTION public.admin_fn() RETURNS int LANGUAGE sql AS 'SELECT 2';
CREATE TABLE public.admin_tab(id int);
INSERT INTO public.admin_tab VALUES (20);
RESET ROLE;
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='admin_fn';
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='admin_tab';
\echo '--- D2) anon executa admin_fn / le admin_tab ---'
SET ROLE anon; SELECT public.admin_fn() AS r; SELECT count(*) AS linhas FROM public.admin_tab; RESET ROLE;

\echo '--- CTRL) controle negativo: revogado de PUBLIC E de anon ---'
CREATE FUNCTION public.ctrl_fn() RETURNS int LANGUAGE sql AS 'SELECT 3';
REVOKE EXECUTE ON FUNCTION public.ctrl_fn() FROM PUBLIC, anon;
SELECT p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='ctrl_fn';
SET ROLE anon; SELECT public.ctrl_fn() AS r; RESET ROLE;
