-- f35_fix: grant EXECUTE na funcao de trigger multiplix_audiences_validate_shared_roles
-- A migration 20261001261230 criou a funcao sem grant de EXECUTE para anon/authenticated.
-- O contrato DB chama a funcao diretamente como cada papel para verificar o grant
-- (convencao do modulo). Este fix adiciona o grant faltante.
--
-- Sem `begin;`/`commit;` (a prova e a aplicacao embrulham a transacao).

GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO anon, authenticated;
