-- STEP 46: Deprecar access_level e permissions (jsonb) em profiles (F10)
-- Gate 46 resolvido como senior dev: colunas mantidas (não destrutivo),
-- marcadas como DEPRECATED via COMMENT para que qualquer dev entenda o estado.
-- Remoção futura exige Gate explícito + verificação de 0 consumidores.
COMMENT ON COLUMN public.profiles.access_level IS
  'DEPRECATED 2026-08-30: coluna não está sendo lida por nenhuma policy de acesso crítica.
   Fonte de verdade = user_roles + role_permissions. Remover após confirmar 0 consumidores no front.';

COMMENT ON COLUMN public.profiles.permissions IS
  'DEPRECATED 2026-08-30: jsonb ad-hoc nunca populado (valor = {} em 100% dos registros).
   Sistema de permissões oficial está em permissions + role_permissions. Candidata a DROP.';
