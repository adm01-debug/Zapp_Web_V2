\echo '=== E) create or replace numa funcao JA endurecida ==='
CREATE FUNCTION public.audit_fn() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
REVOKE EXECUTE ON FUNCTION public.audit_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_fn() TO service_role;
\echo '--- E1) proacl apos endurecer ---'
SELECT p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audit_fn';
\echo '--- E2) CREATE OR REPLACE identico (migration futura reescreve o corpo) ---'
CREATE OR REPLACE FUNCTION public.audit_fn() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$;
SELECT p.oid, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audit_fn';
\echo '--- E3) anon tenta executar apos o replace ---'
SET ROLE anon; SELECT public.audit_fn(); RESET ROLE;
\echo '--- E4) DROP + CREATE (mesmo nome, objeto NOVO) ---'
DROP FUNCTION public.audit_fn();
CREATE FUNCTION public.audit_fn() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
SELECT p.oid, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audit_fn';
SET ROLE anon; SELECT public.audit_fn(); RESET ROLE;
\echo '--- E5) CREATE OR REPLACE com assinatura diferente (vira overload NOVO) ---'
CREATE OR REPLACE FUNCTION public.audit_fn(arg int) RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
SELECT p.oid, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audit_fn' ORDER BY p.oid;
