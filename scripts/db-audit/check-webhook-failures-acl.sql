-- Guard fail-closed da dead-letter queue de webhooks.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
SET search_path TO pg_catalog;

WITH target AS (
  SELECT c.oid, c.relowner, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'webhook_failures'
    AND c.relkind IN ('r', 'p')
),
policy_contract AS (
  SELECT
    count(*) = 1
      AND bool_and(pol.polname = 'service_role_full')
      AND bool_and(pol.polpermissive)
      AND bool_and(pol.polcmd = '*')
      AND bool_and(pol.polroles = ARRAY['service_role'::regrole::oid])
      AND bool_and(pg_get_expr(pol.polqual, pol.polrelid) = 'true')
      AND bool_and(pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true') AS matches
  FROM pg_policy pol
  JOIN target t ON t.oid = pol.polrelid
),
explicit_acl AS (
  SELECT
    COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM target t
  JOIN pg_class c ON c.oid = t.oid
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
  LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
),
unexpected_acl AS (
  SELECT *
  FROM explicit_acl
  WHERE grantee NOT IN ('postgres', 'service_role')
     OR (grantee = 'service_role' AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
     OR (grantee = 'service_role' AND is_grantable)
),
checks AS (
  SELECT
    count(*) = 1 AS table_exists,
    COALESCE(bool_and(t.relrowsecurity), false) AS rls_enabled,
    COALESCE(bool_and(owner_role.rolname = 'postgres'), false) AS owner_postgres,
    COALESCE((SELECT matches FROM policy_contract), false) AS policy_exact,
    COALESCE(
      bool_and(
        has_table_privilege('service_role', t.oid, 'SELECT')
        AND has_table_privilege('service_role', t.oid, 'INSERT')
        AND has_table_privilege('service_role', t.oid, 'UPDATE')
        AND has_table_privilege('service_role', t.oid, 'DELETE')
      ),
      false
    ) AS service_role_crud,
    COALESCE(
      bool_and(NOT has_table_privilege('anon', t.oid, 'SELECT, INSERT, UPDATE, DELETE')),
      false
    ) AS anon_blocked,
    COALESCE(
      bool_and(NOT has_table_privilege('authenticated', t.oid, 'SELECT, INSERT, UPDATE, DELETE')),
      false
    ) AS authenticated_blocked,
    NOT EXISTS (SELECT 1 FROM unexpected_acl) AS explicit_acl_exact
  FROM target t
  JOIN pg_roles owner_role ON owner_role.oid = t.relowner
),
result AS (
  SELECT
    table_exists
      AND rls_enabled
      AND owner_postgres
      AND policy_exact
      AND service_role_crud
      AND anon_blocked
      AND authenticated_blocked
      AND explicit_acl_exact AS acl_segura,
    jsonb_build_object(
      'table_exists', table_exists,
      'rls_enabled', rls_enabled,
      'owner_postgres', owner_postgres,
      'policy_exact', policy_exact,
      'service_role_crud', service_role_crud,
      'anon_blocked', anon_blocked,
      'authenticated_blocked', authenticated_blocked,
      'explicit_acl_exact', explicit_acl_exact
    )::text || COALESCE(
      (
        SELECT E'\nunexpected_acl=' || string_agg(
          format('%s:%s:grantable=%s', grantee, privilege_type, is_grantable),
          ', ' ORDER BY grantee, privilege_type
        )
        FROM unexpected_acl
      ),
      ''
    ) AS resumo
  FROM checks
)
SELECT acl_segura, resumo FROM result \gset

\echo :resumo
\if :acl_segura
  \echo 'OK: webhook_failures restrita a postgres e service_role.'
\else
  \echo 'FALHA: contrato de ACL de webhook_failures foi violado.'
  DO $webhook_failures_acl_guard$
  BEGIN
    RAISE EXCEPTION 'contrato de ACL de webhook_failures foi violado';
  END
  $webhook_failures_acl_guard$;
\endif

