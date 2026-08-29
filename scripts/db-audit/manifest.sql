-- Manifesto estrutural deterministico do schema public.
--
-- Snapshot versionado:
--   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
--     -f scripts/db-audit/manifest.sql > supabase/schema-manifest.json
--
-- Comparacao offline/contra banco vivo:
--   node scripts/db-audit/check-manifest-fresh.mjs /tmp/fresh-manifest.json
--   node scripts/db-audit/diff.mjs /tmp/origem.json /tmp/destino.json
--
-- Chaves sao nomes logicos qualificados; valores sao hashes das definicoes.
-- OID, timestamp de geracao e ordem fisica dos catalogos nao entram nos hashes.

WITH columns_manifest AS (
  SELECT format('%I.%I', c.relname, a.attname) AS k,
         md5(concat_ws('|',
           pg_catalog.format_type(a.atttypid, a.atttypmod),
           a.attnotnull::text,
           a.attidentity,
           a.attgenerated,
           CASE WHEN coll.oid IS NULL THEN ''
                ELSE format('%I.%I', coll_n.nspname, coll.collname) END
         )) AS h
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
  LEFT JOIN pg_namespace coll_n ON coll_n.oid = coll.collnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0
    AND NOT a.attisdropped
), defaults_manifest AS (
  SELECT format('%I.%I', c.relname, a.attname) AS k,
         md5(pg_get_expr(ad.adbin, ad.adrelid, false)) AS h
  FROM pg_attrdef ad
  JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
  JOIN pg_class c ON c.oid = ad.adrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'f')
), constraints_manifest AS (
  SELECT 'relation:' || format('%I.%I', c.relname, co.conname) AS k,
         md5(concat_ws('|',
           co.contype::text,
           co.condeferrable::text,
           co.condeferred::text,
           co.convalidated::text,
           pg_get_constraintdef(co.oid, false)
         )) AS h
  FROM pg_constraint co
  JOIN pg_class c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'domain:' || format('%I.%I', t.typname, co.conname) AS k,
         md5(concat_ws('|',
           co.contype::text,
           co.condeferrable::text,
           co.condeferred::text,
           co.convalidated::text,
           pg_get_constraintdef(co.oid, false)
         )) AS h
  FROM pg_constraint co
  JOIN pg_type t ON t.oid = co.contypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND co.contypid <> 0
), indexes_manifest AS (
  SELECT format('%I.%I', tbl.relname, idx.relname) AS k,
         md5(concat_ws('|',
           i.indisunique::text,
           i.indisprimary::text,
           i.indisexclusion::text,
           i.indimmediate::text,
           i.indisclustered::text,
           i.indisvalid::text,
           i.indisready::text,
           i.indislive::text,
           pg_get_indexdef(i.indexrelid, 0, false)
         )) AS h
  FROM pg_index i
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'public'
), views_manifest AS (
  SELECT format('%s:%I', c.relkind, c.relname) AS k,
         md5(concat_ws('|',
           pg_get_userbyid(c.relowner),
           c.relkind::text,
           c.relpersistence::text,
           c.relispopulated::text,
           coalesce((
             SELECT string_agg(option, ',' ORDER BY option)
             FROM unnest(c.reloptions) AS option
           ), ''),
           pg_get_viewdef(c.oid, false)
         )) AS h
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
), types_manifest AS (
  SELECT format('%s:%I', t.typtype, t.typname) AS k,
         md5(concat_ws('|',
           pg_get_userbyid(t.typowner),
           t.typtype::text,
           t.typcategory::text,
           t.typispreferred::text,
           t.typisdefined::text,
           t.typdelim::text,
           t.typnotnull::text,
           t.typlen::text,
           t.typbyval::text,
           t.typalign::text,
           t.typstorage::text,
           CASE WHEN t.typbasetype = 0 THEN ''
                ELSE pg_catalog.format_type(t.typbasetype, t.typtypmod) END,
           coalesce(pg_get_expr(t.typdefaultbin, 0, false), t.typdefault, ''),
           CASE WHEN coll.oid IS NULL THEN ''
                ELSE format('%I.%I', coll_n.nspname, coll.collname) END,
           coalesce((
             SELECT string_agg(
               enum.enumsortorder::text || ':' || enum.enumlabel,
               ',' ORDER BY enum.enumsortorder
             )
             FROM pg_enum enum
             WHERE enum.enumtypid = t.oid
           ), ''),
           coalesce((
             SELECT string_agg(
               format(
                 '%I:%s:%s',
                 attribute.attname,
                 pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
                 attribute.attnotnull
               ),
               ',' ORDER BY attribute.attnum
             )
             FROM pg_attribute attribute
             WHERE attribute.attrelid = t.typrelid
               AND attribute.attnum > 0
               AND NOT attribute.attisdropped
           ), ''),
           coalesce(pg_catalog.format_type(range_def.rngsubtype, NULL), ''),
           coalesce(range_def.rngsubopc::regclass::text, ''),
           CASE WHEN range_def.rngcollation = 0 THEN ''
                ELSE range_def.rngcollation::regcollation::text END,
           CASE WHEN range_def.rngcanonical = 0 THEN ''
                ELSE range_def.rngcanonical::regprocedure::text END,
           CASE WHEN range_def.rngsubdiff = 0 THEN ''
                ELSE range_def.rngsubdiff::regprocedure::text END,
           coalesce(pg_catalog.format_type(range_def.rngmultitypid, NULL), '')
         )) AS h
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  LEFT JOIN pg_class composite ON composite.oid = t.typrelid
  LEFT JOIN pg_collation coll ON coll.oid = t.typcollation AND t.typcollation <> 0
  LEFT JOIN pg_namespace coll_n ON coll_n.oid = coll.collnamespace
  LEFT JOIN pg_range range_def
    ON range_def.rngtypid = t.oid OR range_def.rngmultitypid = t.oid
  WHERE n.nspname = 'public'
    AND (
      t.typtype IN ('d', 'e', 'r', 'm')
      OR (t.typtype = 'c' AND composite.relkind = 'c')
      OR (t.typtype = 'b' AND t.typelem = 0 AND t.typisdefined)
    )
), rls_manifest AS (
  SELECT format('%I', c.relname) AS k,
         md5(concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text)) AS h
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
), policies_manifest AS (
  SELECT format('%I.%I', c.relname, p.polname) AS k,
         md5(concat_ws('|',
           p.polcmd::text,
           p.polpermissive::text,
           coalesce((
             SELECT string_agg(
               CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END,
               ',' ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
             )
             FROM unnest(p.polroles) AS role_oid
           ), ''),
           coalesce(pg_get_expr(p.polqual, p.polrelid, false), ''),
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid, false), '')
         )) AS h
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
), triggers_manifest AS (
  SELECT format('%I.%I', c.relname, tg.tgname) AS k,
         md5(concat_ws('|', tg.tgenabled::text, pg_get_triggerdef(tg.oid, false))) AS h
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT tg.tgisinternal
), functions_manifest AS (
  SELECT format(
           '%s:%I(%s)',
           p.prokind,
           p.proname,
           pg_get_function_identity_arguments(p.oid)
         ) AS k,
         md5(concat_ws('|',
           pg_get_userbyid(p.proowner),
           p.prokind::text,
           coalesce(pg_get_function_result(p.oid), ''),
           l.lanname,
           p.provolatile::text,
           p.proparallel::text,
           p.prosecdef::text,
           p.proleakproof::text,
           p.proisstrict::text,
           coalesce(array_to_string(p.proconfig, ','), ''),
           pg_get_functiondef(p.oid)
         )) AS h
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
), relation_grants_manifest AS (
  SELECT format(
           '%s:%I.%I|%s|%s|grantor=%s',
           c.relkind,
           n.nspname,
           c.relname,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(
    c.relacl,
    acldefault(
      CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
      c.relowner
    )
  )) AS acl
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
), column_grants_manifest AS (
  SELECT format(
           '%s:%I.%I.%I|%s|%s|grantor=%s',
           c.relkind,
           n.nspname,
           c.relname,
           a.attname,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attacl IS NOT NULL
), routine_grants_manifest AS (
  SELECT format(
           '%s:%I(%s)|%s|%s|grantor=%s',
           p.prokind,
           p.proname,
           pg_get_function_identity_arguments(p.oid),
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) AS acl
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
), type_grants_manifest AS (
  SELECT format(
           '%s:%I.%I|%s|%s|grantor=%s',
           t.typtype,
           n.nspname,
           t.typname,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  LEFT JOIN pg_class composite ON composite.oid = t.typrelid
  CROSS JOIN LATERAL aclexplode(coalesce(t.typacl, acldefault('T'::"char", t.typowner))) AS acl
  WHERE n.nspname = 'public'
    AND (
      t.typtype IN ('d', 'e', 'r', 'm')
      OR (t.typtype = 'c' AND composite.relkind = 'c')
      OR (t.typtype = 'b' AND t.typelem = 0 AND t.typisdefined)
    )
), default_grants_manifest AS (
  SELECT format(
           '%s|%s|%s|%s|%s|grantor=%s',
           CASE WHEN defaults.defaclnamespace = 0 THEN '<global>' ELSE namespace.nspname END,
           pg_get_userbyid(defaults.defaclrole),
           defaults.defaclobjtype,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_default_acl defaults
  LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
  WHERE defaults.defaclnamespace = 0 OR namespace.nspname = 'public'
), schema_grants_manifest AS (
  SELECT format(
           '%I|%s|%s|grantor=%s',
           n.nspname,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           acl.privilege_type,
           pg_get_userbyid(acl.grantor)
         ) AS k,
         md5(acl.is_grantable::text) AS h
  FROM pg_namespace n
  CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) AS acl
  WHERE n.nspname = 'public'
)
SELECT jsonb_pretty(jsonb_build_object(
  'format_version', 2,
  'generated_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'database_identity', jsonb_build_object(
    'database', current_database(),
    'schema', 'public',
    'server_major', current_setting('server_version_num')::integer / 10000
  ),
  'how_to_regenerate', 'scripts/db-audit/manifest.sql',
  'columns',         (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM columns_manifest),
  'defaults',        (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM defaults_manifest),
  'constraints',     (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM constraints_manifest),
  'indexes',         (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM indexes_manifest),
  'views',           (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM views_manifest),
  'types',           (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM types_manifest),
  'rls',             (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM rls_manifest),
  'policies',        (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM policies_manifest),
  'triggers',        (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM triggers_manifest),
  'functions',       (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM functions_manifest),
  'relation_grants', (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM relation_grants_manifest),
  'column_grants',   (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM column_grants_manifest),
  'routine_grants',  (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM routine_grants_manifest),
  'type_grants',     (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM type_grants_manifest),
  'default_grants',  (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM default_grants_manifest),
  'schema_grants',   (SELECT coalesce(jsonb_object_agg(k, h ORDER BY k), '{}'::jsonb) FROM schema_grants_manifest)
));
