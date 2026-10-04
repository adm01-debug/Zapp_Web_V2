-- Guarda generica (M-DB-02): nenhuma funcao SECURITY DEFINER do schema public pode ter EXECUTE
-- para PUBLIC ou para anon. Falha (ERROR, exit != 0 com ON_ERROR_STOP) e lista cada funcao.
--
-- Por que generica: o furo de record_incoming_call_event (T26, 20261002531230) nao veio de um GRANT
-- escrito, veio de um `create or replace` com parametro novo, que cria OUTRA identidade com o ACL
-- padrao (EXECUTE para PUBLIC). Guarda por nome nao pega isso; esta pega qualquer funcao.
--
-- O criterio e has_function_privilege('anon'), que cobre grant direto a anon, via PUBLIC (toda role
-- e membro de PUBLIC) e via heranca de role. O rotulo [PUBLIC] sai do ACL efetivo (proacl NULL =
-- acldefault do dono, que inclui PUBLIC) e diz se o furo vem de PUBLIC ou de grant a anon.
-- Funcao TRIGGER entra tambem: nao e RPC, mas a regra do repo (20261001191230) e fechar o EXECUTE
-- delas igual. Excecao so com justificativa escrita aqui, por identidade exata. Hoje: nenhuma.
--
-- Uso: psql "<url>" -X -v ON_ERROR_STOP=1 -f scripts/db-audit/check-secdef-public-execute.sql
--      zapp-db-local psql <copia> <nome> < scripts/db-audit/check-secdef-public-execute.sql
-- Prova de que a guarda nao e vacua: scripts/db-audit/check-secdef-public-execute.test.sh

\set ON_ERROR_STOP on
SET search_path TO pg_catalog;

DO $guard$
DECLARE
  v_offenders text;
  v_total integer;
BEGIN
  IF to_regrole('anon') IS NULL THEN
    RAISE EXCEPTION 'check-secdef-public-execute: role anon nao existe neste banco (alvo errado?)';
  END IF;

  SELECT count(*) INTO v_total
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'check-secdef-public-execute: nenhuma funcao SECURITY DEFINER em public (alvo errado?)';
  END IF;

  SELECT string_agg(format('%s [%s]', p.oid::regprocedure,
                           concat_ws(',',
                             CASE WHEN EXISTS (
                               SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
                             THEN 'PUBLIC' END,
                             CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon' END)),
                    E'\n  ' ORDER BY p.oid::regprocedure::text)
    INTO v_offenders
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION E'check-secdef-public-execute: funcao SECURITY DEFINER de public com EXECUTE para PUBLIC/anon:\n  %', v_offenders
      USING HINT = 'REVOKE EXECUTE ON FUNCTION <identidade> FROM PUBLIC, anon; e GRANT so para quem chama.';
  END IF;

  RAISE NOTICE 'check-secdef-public-execute: OK (% funcoes SECURITY DEFINER em public, nenhuma com PUBLIC/anon)', v_total;
END
$guard$;
