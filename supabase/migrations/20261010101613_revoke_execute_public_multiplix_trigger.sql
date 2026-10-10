-- revogar-execute-public-multiplix-trigger
-- Rollback: GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO PUBLIC, anon, authenticated;

-- A função multiplix_audiences_validate_shared_roles() é o único gatilho do banco
-- que ainda concede EXECUTE a PUBLIC, anon e authenticated. Revogar essas
-- permissões e restringir a service_role (postgres e service_role são os únicos
-- papéis que precisam chamá-la diretamente; o mecanismo de trigger dispensa
-- EXECUTE para quem dispara o INSERT/UPDATE na tabela).

REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO service_role;
