-- Verifica fail-closed o contrato das funcoes que executam SQL arbitrario para
-- o gateway MCP. Somente postgres e service_role podem ter EXECUTE.
--
-- Cobre: assinatura ausente, overload errado, owner/SECURITY DEFINER alterados,
-- grant direto ou herdado para qualquer role nao-superuser inesperada, grant para
-- PUBLIC, WITH GRANT OPTION, search_path e corpo endurecido.
--
-- As arestas de membership abaixo reproduzem exatamente a topologia observada
-- no Supabase Cloud PG 17.6. authenticator, Realtime e Storage nao herdam o
-- EXECUTE na sessao, mas conservam SET OPTION para os fluxos internos da
-- plataforma. postgres e tratado nominalmente porque no Cloud ele e uma
-- pseudo-superuser (rolsuper=false). Qualquer aresta, atributo ou caminho novo
-- ate service_role falha, inclusive para roles custom NOINHERIT. Superusers
-- reais ficam fora deste perimetro porque sempre ignoram ACL.
--
-- Os fingerprints abaixo usam prosrc com whitespace colapsado. mcp_exec_many
-- possui duas representacoes revisadas e semanticamente equivalentes: o fonte
-- formatado do repo e o corpo compactado recuperado do runtime. Qualquer outro
-- corpo exige revisao explicita deste contrato.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
SET search_path TO pg_catalog;

WITH RECURSIVE expected(
  signature,
  expected_arg_names,
  expected_default_expression,
  expected_body_md5s,
  function_oid
) AS (
  VALUES
    (
      'public.mcp_exec(text,integer)',
      ARRAY['sql', 'max_rows']::text[],
      '200',
      ARRAY['8f8356d5fbeb51bcb5f6ab4e5a4fc1c8']::text[],
      to_regprocedure('public.mcp_exec(text,integer)')
    ),
    (
      'public.mcp_exec_many(text[],integer)',
      ARRAY['statements', 'max_rows']::text[],
      '100',
      ARRAY[
        '509fb7baea9d4a7c77b36d381a1527cd',
        '61948e225a30ce3f73e13c833716e74c'
      ]::text[],
      to_regprocedure('public.mcp_exec_many(text[],integer)')
    )
),
expected_service_role_edges(
  granted_role_name,
  member_role_name,
  member_rolinherit,
  inherit_option,
  set_option,
  admin_option
) AS (
  VALUES
    ('authenticator', 'postgres', true, true, true, true),
    ('authenticator', 'supabase_storage_admin', false, false, true, false),
    ('service_role', 'authenticator', false, false, true, false),
    ('service_role', 'postgres', true, true, true, true),
    ('service_role', 'supabase_realtime_admin', false, false, true, false)
),
service_role_reachability(member_oid, membership_path) AS (
  SELECT
    membership.member,
    ARRAY[membership.roleid, membership.member]::oid[]
  FROM pg_auth_members membership
  JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
  WHERE granted_role.rolname = 'service_role'

  UNION ALL

  SELECT
    membership.member,
    reach.membership_path || membership.member
  FROM service_role_reachability reach
  JOIN pg_auth_members membership ON membership.roleid = reach.member_oid
  WHERE NOT membership.member = ANY(reach.membership_path)
),
reachable_role_oids(role_oid) AS (
  SELECT oid FROM pg_roles WHERE rolname = 'service_role'
  UNION
  SELECT member_oid FROM service_role_reachability
),
actual_service_role_edges AS (
  SELECT
    granted_role.rolname AS granted_role_name,
    member_role.rolname AS member_role_name,
    member_role.rolinherit AS member_rolinherit,
    membership.inherit_option,
    membership.set_option,
    membership.admin_option
  FROM pg_auth_members membership
  JOIN reachable_role_oids reachable ON reachable.role_oid = membership.roleid
  JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
  JOIN pg_roles member_role ON member_role.oid = membership.member
),
unexpected_service_role_edges AS (
  SELECT * FROM actual_service_role_edges
  EXCEPT
  SELECT * FROM expected_service_role_edges
),
missing_service_role_edges AS (
  SELECT * FROM expected_service_role_edges
  EXCEPT
  SELECT * FROM actual_service_role_edges
),
explicit_execute_acl AS (
  SELECT
    e.signature,
    COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee,
    acl.is_grantable
  FROM expected e
  JOIN pg_proc p ON p.oid = e.function_oid
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
  WHERE acl.privilege_type = 'EXECUTE'
),
unexpected_effective_roles AS (
  SELECT e.signature, candidate_role.rolname
  FROM expected e
  JOIN pg_roles candidate_role
    ON NOT candidate_role.rolsuper
   AND candidate_role.rolname NOT IN ('postgres', 'service_role')
  WHERE e.function_oid IS NOT NULL
    AND has_function_privilege(candidate_role.oid, e.function_oid, 'EXECUTE')
),
unexpected_explicit_grants AS (
  SELECT signature, grantee
  FROM explicit_execute_acl
  WHERE grantee NOT IN ('postgres', 'service_role')
),
unexpected_grant_options AS (
  SELECT signature, grantee
  FROM explicit_execute_acl
  WHERE is_grantable
    AND grantee <> 'postgres'
),
checks AS (
  SELECT
    e.signature,
    e.function_oid IS NOT NULL AS function_exists,
    COALESCE(p.prosecdef, false) AS security_definer,
    COALESCE(owner_role.rolname = 'postgres', false) AS owner_is_postgres,
    COALESCE(language.lanname = 'plpgsql', false) AS language_is_plpgsql,
    COALESCE(p.prorettype = 'jsonb'::regtype AND NOT p.proretset, false) AS returns_jsonb,
    COALESCE(p.provolatile = 'v', false) AS function_is_volatile,
    COALESCE(NOT p.proisstrict, false) AS function_is_not_strict,
    COALESCE(p.proparallel = 'u', false) AS function_is_parallel_unsafe,
    COALESCE(NOT p.proleakproof, false) AS function_is_not_leakproof,
    COALESCE(p.proargnames = e.expected_arg_names, false) AS argument_names_match,
    COALESCE(
      p.pronargdefaults = 1
      AND pg_get_expr(p.proargdefaults, 0) = e.expected_default_expression,
      false
    ) AS default_contract_matches,
    COALESCE(
      (
        SELECT count(*) = 1
          AND bool_and(config = 'search_path=pg_catalog, public')
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) config
        WHERE config LIKE 'search_path=%'
      ),
      false
    ) AS search_path_is_safe,
    COALESCE(
      md5(regexp_replace(btrim(p.prosrc), '[[:space:]]+', ' ', 'g')) = ANY(e.expected_body_md5s),
      false
    ) AS body_contract_matches,
    COALESCE(
      md5(regexp_replace(btrim(p.prosrc), '[[:space:]]+', ' ', 'g')),
      ''
    ) AS body_md5,
    COALESCE(has_function_privilege('postgres', e.function_oid, 'EXECUTE'), false) AS postgres_execute,
    COALESCE(has_function_privilege('service_role', e.function_oid, 'EXECUTE'), false) AS service_role_execute,
    (
      SELECT count(*) = 1
      FROM explicit_execute_acl acl
      WHERE acl.signature = e.signature
        AND acl.grantee = 'service_role'
        AND NOT acl.is_grantable
    ) AS service_role_direct_execute,
    COALESCE(has_function_privilege('authenticated', e.function_oid, 'EXECUTE'), true) AS authenticated_execute,
    COALESCE(has_function_privilege('anon', e.function_oid, 'EXECUTE'), true) AS anon_execute,
    EXISTS (
      SELECT 1
      FROM unexpected_explicit_grants grant_acl
      WHERE grant_acl.signature = e.signature
    ) AS unexpected_execute_grant,
    EXISTS (
      SELECT 1
      FROM unexpected_effective_roles effective_role
      WHERE effective_role.signature = e.signature
    ) AS unexpected_effective_execute,
    EXISTS (
      SELECT 1
      FROM unexpected_grant_options grant_option
      WHERE grant_option.signature = e.signature
    ) AS unexpected_grant_option
  FROM expected e
  LEFT JOIN pg_proc p ON p.oid = e.function_oid
  LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
  LEFT JOIN pg_language language ON language.oid = p.prolang
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
      AND language_is_plpgsql
      AND returns_jsonb
      AND function_is_volatile
      AND function_is_not_strict
      AND function_is_parallel_unsafe
      AND function_is_not_leakproof
      AND argument_names_match
      AND default_contract_matches
      AND search_path_is_safe
      AND body_contract_matches
      AND postgres_execute
      AND service_role_execute
      AND service_role_direct_execute
      AND NOT authenticated_execute
      AND NOT anon_execute
      AND NOT unexpected_execute_grant
      AND NOT unexpected_effective_execute
      AND NOT unexpected_grant_option
    ), false)
    AND NOT EXISTS (SELECT 1 FROM unexpected_overloads)
    AND NOT EXISTS (SELECT 1 FROM unexpected_service_role_edges)
    AND NOT EXISTS (SELECT 1 FROM missing_service_role_edges) AS acl_segura,
    string_agg(
      format(
        '%s %s',
        signature,
        jsonb_build_object(
          'exists', function_exists,
          'secdef', security_definer,
          'owner_postgres', owner_is_postgres,
          'language_plpgsql', language_is_plpgsql,
          'returns_jsonb', returns_jsonb,
          'volatile', function_is_volatile,
          'not_strict', function_is_not_strict,
          'parallel_unsafe', function_is_parallel_unsafe,
          'not_leakproof', function_is_not_leakproof,
          'argument_names', argument_names_match,
          'default_contract', default_contract_matches,
          'search_path', search_path_is_safe,
          'body_contract', body_contract_matches,
          'body_md5', body_md5,
          'postgres', postgres_execute,
          'service_role', service_role_execute,
          'service_role_direct', service_role_direct_execute,
          'authenticated', authenticated_execute,
          'anon', anon_execute,
          'grant_inesperado', unexpected_execute_grant,
          'role_efetiva_inesperada', unexpected_effective_execute,
          'grant_option_inesperado', unexpected_grant_option
        )::text
      ),
      E'\n' ORDER BY signature
    ) || COALESCE(
      (
        SELECT E'\nunexpected_overload=' || string_agg(signature, ', ' ORDER BY signature)
        FROM unexpected_overloads
      ),
      ''
    ) || COALESCE(
      (
        SELECT E'\nunexpected_service_role_edge=' || string_agg(
          format(
            '%s->%s(inherit_role=%s,inherit_edge=%s,set=%s,admin=%s)',
            granted_role_name,
            member_role_name,
            member_rolinherit,
            inherit_option,
            set_option,
            admin_option
          ),
          ', ' ORDER BY granted_role_name, member_role_name
        )
        FROM unexpected_service_role_edges
      ),
      ''
    ) || COALESCE(
      (
        SELECT E'\nmissing_service_role_edge=' || string_agg(
          format(
            '%s->%s(inherit_role=%s,inherit_edge=%s,set=%s,admin=%s)',
            granted_role_name,
            member_role_name,
            member_rolinherit,
            inherit_option,
            set_option,
            admin_option
          ),
          ', ' ORDER BY granted_role_name, member_role_name
        )
        FROM missing_service_role_edges
      ),
      ''
    ) || COALESCE(
      (
        SELECT E'\nunexpected_effective_role=' ||
          string_agg(signature || ':' || rolname, ', ' ORDER BY signature, rolname)
        FROM unexpected_effective_roles
      ),
      ''
    ) || COALESCE(
      (
        SELECT E'\nunexpected_explicit_grant=' ||
          string_agg(signature || ':' || grantee, ', ' ORDER BY signature, grantee)
        FROM unexpected_explicit_grants
      ),
      ''
    ) || COALESCE(
      (
        SELECT E'\nunexpected_grant_option=' ||
          string_agg(signature || ':' || grantee, ', ' ORDER BY signature, grantee)
        FROM unexpected_grant_options
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
  DO $acl_guard_failure$
  BEGIN
    RAISE EXCEPTION 'contrato de ACL das funcoes MCP foi violado';
  END
  $acl_guard_failure$;
\endif
