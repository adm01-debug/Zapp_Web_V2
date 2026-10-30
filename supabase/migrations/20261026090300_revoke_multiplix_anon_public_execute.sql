-- revoke_multiplix_anon_public_execute
-- Rollback: GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO PUBLIC, anon, authenticated;
--
-- Nenhuma linha de dado e tocada: so ACL da funcao de trigger.
--
-- 1. public.multiplix_audiences_validate_shared_roles() e funcao de TRIGGER
--    (BEFORE INSERT OR UPDATE em public.multiplix_audiences). O gatilho roda
--    como o dono da funcao e NAO checa EXECUTE do chamador; nenhum codigo
--    (front, edge, RPC) chama a funcao diretamente. O EXECUTE para anon e
--    PUBLIC veio de DDL aplicada direto em 19/10/2026 (ledger 20261019000001
--    e 20261019010001) e contraria a higiene 20261011010001.
-- 2. Segue a higiene: revoga PUBLIC, anon e authenticated. service_role
--    permanece (server-side).

REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles()
  FROM PUBLIC, anon, authenticated;
