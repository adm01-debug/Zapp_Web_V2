\echo '=== E5b) overload: mesma assinatura x assinatura nova (funcao normal) ==='
CREATE FUNCTION public.rep_fn(a int) RETURNS int LANGUAGE sql AS 'SELECT a';
REVOKE EXECUTE ON FUNCTION public.rep_fn(int) FROM PUBLIC, anon;
SELECT p.oid, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rep_fn';
\echo '--- replace MESMA assinatura ---'
CREATE OR REPLACE FUNCTION public.rep_fn(a int) RETURNS int LANGUAGE sql AS 'SELECT a*2';
SELECT p.oid, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rep_fn';
\echo '--- replace com assinatura DIFERENTE (overload novo) ---'
CREATE OR REPLACE FUNCTION public.rep_fn(a int, b int DEFAULT 0) RETURNS int LANGUAGE sql AS 'SELECT a+b';
SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS assinatura, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rep_fn' ORDER BY p.oid;
SET ROLE anon; \echo '--- anon executa overload novo rep_fn(1) ---'
SELECT public.rep_fn(1) AS r; RESET ROLE;
