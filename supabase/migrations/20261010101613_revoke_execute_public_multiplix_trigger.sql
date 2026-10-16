-- revogar-execute-public-multiplix-trigger
-- Rollback: GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO PUBLIC, anon, authenticated; REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() FROM service_role;

-- A função public.multiplix_audiences_validate_shared_roles() é um gatilho
-- (RETURNS trigger) criado pela migration 20261001261230 (F35) com o EXECUTE
-- default para PUBLIC — e nenhuma migration posterior revogou (a 20261001191230
-- revogou o EXECUTE dos gatilhos existentes até aquela versão; a F35 nasceu
-- depois, com versão maior). O PG só confere EXECUTE de função trigger no
-- CREATE TRIGGER, nunca a cada disparo: revogar de PUBLIC, anon e
-- authenticated não quebra INSERT/UPDATE nas tabelas (o teste deste cartão
-- prova a inserção como authenticated com o gatilho disparando). O GRANT
-- explícito a service_role segue o padrão das demais funções internas do
-- Multiplix (ex.: multiplix_create_draft, multiplix_bump_version_*); postgres,
-- dono da função, conserva EXECUTE sempre. O rollback acima devolve o estado
-- anterior exato: EXECUTE de volta a PUBLIC/anon/authenticated e remoção do
-- GRANT explícito a service_role (antes da migration não havia entrada
-- explícita para service_role no proacl — só o default via PUBLIC).

REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO service_role;
