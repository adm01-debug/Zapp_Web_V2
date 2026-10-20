CREATE ROLE nobody NOLOGIN;   -- representa "PUBLIC" (membro de nada)
\echo '--- A1) criar funcao simples como postgres ---'
CREATE FUNCTION public.nova_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
\echo '--- A2) proacl resultante ---'
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef, p.proacl::text AS proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='nova_fn';
\echo '--- A3) has_function_privilege ---'
SELECT 'anon'        AS role, has_function_privilege('anon','public.nova_fn()','EXECUTE') AS pode_exec
UNION ALL SELECT 'authenticated', has_function_privilege('authenticated','public.nova_fn()','EXECUTE')
UNION ALL SELECT 'service_role',  has_function_privilege('service_role','public.nova_fn()','EXECUTE')
UNION ALL SELECT 'nobody(PUBLIC)',has_function_privilege('nobody','public.nova_fn()','EXECUTE');
\echo '--- A4) EXECUTAR como anon ---'
SET ROLE anon;
SELECT public.nova_fn() AS "anon_resultado";
RESET ROLE;
\echo '--- A5) EXECUTAR como nobody (PUBLIC) ---'
SET ROLE nobody;
SELECT public.nova_fn() AS "public_resultado";
RESET ROLE;
