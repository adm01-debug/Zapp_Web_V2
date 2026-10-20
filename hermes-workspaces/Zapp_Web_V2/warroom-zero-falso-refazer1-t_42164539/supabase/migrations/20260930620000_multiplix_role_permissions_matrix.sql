-- 20260930620000_multiplix_role_permissions_matrix
-- Bloco B (F25) de docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Versao reservada com hermes-db-migrar --nova=multiplix_role_permissions_matrix.
--
-- PORQUE
-- O modulo Multiplix tinha catalogo de permissoes (20260926150000) e UMA unica
-- atribuicao a papel (20260929640000: admin -> multiplix.dispatch.manage_all).
-- Sem linhas em role_permissions, supervisor e agent nao recebem nenhuma permissao
-- do modulo: a edge multiplix-audience so abre escopo via is_admin() e o nav/ViewRouter
-- nao distingue quem pode usar. F25 materializa a matriz perfil x papel x escopo abaixo.
--
-- MATRIZ F25 (nomes reais do catalogo; `permissions.name`)
-- | role       | role_permissions (permission.name)                                        |
-- |------------|---------------------------------------------------------------------------|
-- | admin      | multiplix.audience.admin, multiplix.dispatch.create, multiplix.dispatch.manage_all |
-- | supervisor | multiplix.audience.suppliers, multiplix.audience.carriers,                 |
-- |            | multiplix.audience.customers.all, multiplix.dispatch.create                |
-- | agent      | multiplix.audience.customers.own, multiplix.dispatch.create                |
-- O plano escreve os nomes encurtados ("suppliers", "carriers", "customers.all",
-- "customers.own") — sao SUFIXOS: no catalogo os nomes sao
-- multiplix.audience.suppliers/.carriers/.customers.all/.customers.own (conferido ao
-- vivo em 2026-10-01 e em docs/multiplix/PERMISSOES.md). Nao existem permissoes com
-- os nomes encurtados.
--
-- CLASSE: ADITIVA. Somente INSERT ... ON CONFLICT DO NOTHING. Nenhum UPDATE/DELETE/
-- TRUNCATE/DROP, nenhum ALTER. Linha que ja existir com outro valor NAO e alterada
-- (o DO NOTHING apenas ignora): a migration nunca "corrige" atribuicao existente.
--
-- O QUE JA EXISTIA (nao recriado, entra so como no-op):
--   * multiplix.dispatch.manage_all: ja existe E ja esta ligada a admin (20260929640000).
--   * as 5 permissoes multiplix.audience.*: ja existem no catalogo (20260926150000).
--
-- DEPENDENCIA NOVA (achado): `multiplix.dispatch.create` NAO existia no catalogo
-- (medido ao vivo em 2026-10-01: so 6 permissoes multiplix.*, nenhuma dispatch.create;
-- e o nome so aparece no texto do plano, em nenhuma migration do repo). Sem cria-la, as
-- 4 linhas de supervisor e as 2 de agent nao teriam permission_id e o INSERT nao
-- gravaria nada em silencio. Por isso a criacao da permissao entra no mesmo arquivo, no
-- mesmo padrao aditivo de 20260929640000 (permissao + atribuicao juntas). Criar a
-- permissao exige SOMENTE INSERT: permissions.name e UNIQUE NOT NULL, category e NOT
-- NULL DEFAULT 'general' (aqui 'multiplix', igual as demais do modulo), description e
-- nullable, id/created_at tem default — nenhum enum, coluna, constraint ou ALTER TYPE novo.
--
-- CONTAGEM: 9 pares na matriz; 1 (admin -> multiplix.dispatch.manage_all) ja existia,
-- logo esta migration insere 8 linhas NOVAS em role_permissions.
--
-- rollback: DELETE FROM public.role_permissions rp USING public.permissions p WHERE rp.permission_id = p.id AND rp.role IN ('admin'::public.app_role, 'supervisor'::public.app_role, 'agent'::public.app_role) AND p.name IN ('multiplix.audience.admin', 'multiplix.audience.suppliers', 'multiplix.audience.carriers', 'multiplix.audience.customers.all', 'multiplix.audience.customers.own', 'multiplix.dispatch.create'); DELETE FROM public.permissions pe WHERE pe.name = 'multiplix.dispatch.create' AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.permission_id = pe.id);
-- Versao expandida do rollback (equivalente a linha acima), para leitura:
-- DELETE FROM public.role_permissions rp
--  USING public.permissions p
--  WHERE rp.permission_id = p.id
--    AND (
--      (rp.role = 'admin'::public.app_role      AND p.name IN (
--            'multiplix.audience.admin', 'multiplix.dispatch.create'))
--      OR (rp.role = 'supervisor'::public.app_role AND p.name IN (
--            'multiplix.audience.suppliers', 'multiplix.audience.carriers',
--            'multiplix.audience.customers.all', 'multiplix.dispatch.create'))
--      OR (rp.role = 'agent'::public.app_role      AND p.name IN (
--            'multiplix.audience.customers.own', 'multiplix.dispatch.create'))
--    );
-- -- A linha admin -> multiplix.dispatch.manage_all NAO e removida: e de outra migration.
-- -- A permissao nova so e removida se nada mais apontar para ela (evita cascata):
-- DELETE FROM public.permissions pe
--  WHERE pe.name = 'multiplix.dispatch.create'
--    AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.permission_id = pe.id);

-- 1) Catalogo: permissao nomeada que o F25 introduz (idempotente; no-op se ja existir).
INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.dispatch.create', 'Multiplix: criar e operar os proprios disparos (nav e rota por permissao nomeada)', 'multiplix')
ON CONFLICT (name) DO NOTHING;

-- 2) Matriz perfil x papel (9 pares; 8 novos, 1 no-op). Uma instrucao: resolve o
--    permission_id pelo NOME (nunca UUID fixo) e ignora o que ja existe.
INSERT INTO public.role_permissions (role, permission_id)
SELECT v.role, p.id
  FROM (VALUES
    ('admin'::public.app_role,      'multiplix.audience.admin'),
    ('admin'::public.app_role,      'multiplix.dispatch.create'),
    ('admin'::public.app_role,      'multiplix.dispatch.manage_all'),
    ('supervisor'::public.app_role, 'multiplix.audience.suppliers'),
    ('supervisor'::public.app_role, 'multiplix.audience.carriers'),
    ('supervisor'::public.app_role, 'multiplix.audience.customers.all'),
    ('supervisor'::public.app_role, 'multiplix.dispatch.create'),
    ('agent'::public.app_role,      'multiplix.audience.customers.own'),
    ('agent'::public.app_role,      'multiplix.dispatch.create')
  ) AS v(role, permission_name)
  JOIN public.permissions AS p ON p.name = v.permission_name
ON CONFLICT (role, permission_id) DO NOTHING;
