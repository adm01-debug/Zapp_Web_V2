-- Verifica fail-closed o contrato das funcoes que executam SQL arbitrario para
-- o gateway MCP. Somente postgres e service_role podem ter EXECUTE.
--
-- Cobre: assinatura ausente, overload errado, owner/SECURITY DEFINER alterados,
-- grant direto ou herdado para anon/authenticated, grant para PUBLIC e qualquer
-- outro grantee inesperado.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

WITH expected(signature, function_oid) AS (
  VALUES
    ('public.mcp_exec(text,integer)', to_regprocedure('public.mcp_exec(text,integer)')),
    ('public.mcp_exec_many(text[],integer)', to_regprocedure('public.mcp_exec_many(text[],integer)'))
),
checks AS (
  SELECT
    e.signature,
    e.function_oid IS NOT NULL AS function_exists,
    COALESCE(p.prosecdef, false) AS security_definer,
    COALESCE(owner_role.rolname = 'postgres', false) AS owner_is_postgres,
    COALESCE(has_function_privilege('postgres', e.function_oid, 'EXECUTE'), false) AS postgres_execute,
    COALESCE(has_function_privilege('service_role', e.function_oid, 'EXECUTE'), false) AS service_role_execute,
    COALESCE(has_function_privilege('authenticated', e.function_oid, 'EXECUTE'), true) AS authenticated_execute,
    COALESCE(has_function_privilege('anon', e.function_oid, 'EXECUTE'), true) AS anon_execute,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      WHERE acl.privilege_type = 'EXECUTE'
        AND COALESCE(grantee_role.rolname, 'PUBLIC') NOT IN ('postgres', 'service_role')
    ) AS unexpected_execute_grant
  FROM expected e
  LEFT JOIN pg_proc p ON p.oid = e.function_oid
  LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
),
unexpected_overloads AS (
  SELECT p.oid::regprocedure::text AS signature
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('mcp_exec', 'mcp_exec_many')
    AND p.oid NOT IN (
      SELECT function_oid
      FROM expected
      WHERE function_oid IS NOT NULL
    )
),
result AS (
  SELECT
    COALESCE(bool_and(
      function_exists
      AND security_definer
      AND owner_is_postgres
      AND postgres_execute
      AND service_role_execute
      AND NOT authenticated_execute
      AND NOT anon_execute
      AND NOT unexpected_execute_grant
    ), false)
    AND NOT EXISTS (SELECT 1 FROM unexpected_overloads) AS acl_segura,
    string_agg(
      format(
        '%s exists=%s secdef=%s owner_postgres=%s postgres=%s service_role=%s authenticated=%s anon=%s grant_inesperado=%s',
        signature,
        function_exists,
        security_definer,
        owner_is_postgres,
        postgres_execute,
        service_role_execute,
        authenticated_execute,
        anon_execute,
        unexpected_execute_grant
      ),
      E'\n' ORDER BY signature
    ) || COALESCE(
      (
        SELECT E'\nunexpected_overload=' || string_agg(signature, ', ' ORDER BY signature)
        FROM unexpected_overloads
      ),
      ''
    ) AS resumo
  FROM checks
)
SELECT acl_segura, resumo FROM result \gset

\echo :resumo
\if :acl_segura
  \echo 'OK: mcp_exec e mcp_exec_many restritas a postgres e service_role.'
\else
  \echo 'FALHA: contrato de ACL das funcoes MCP foi violado.'
  \quit 1
\endif
