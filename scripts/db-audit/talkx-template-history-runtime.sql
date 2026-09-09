WITH target_relation AS (
  SELECT c.oid, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'talkx_template_versions'
    AND c.relkind IN ('r', 'p')
), expected_functions AS (
  SELECT p.oid, p.proname, p.prosecdef,
         COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS safe_path,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (p.proname = 'update_talkx_template_with_snapshot'
       AND pg_get_function_identity_arguments(p.oid) =
         'p_template_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_category text, p_content text, p_media_url text, p_media_type text, p_tags text[], p_status text, p_custom_variables text[]')
      OR (p.proname = 'guard_talkx_template_version_immutable'
          AND pg_get_function_identity_arguments(p.oid) = '')
      OR (p.proname = 'increment_talkx_template_use'
          AND pg_get_function_identity_arguments(p.oid) = 'p_template_id uuid')
      OR (p.proname = 'guard_talkx_template_update'
          AND pg_get_function_identity_arguments(p.oid) = '')
    )
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'table_count', (SELECT count(*) FROM target_relation),
    'custom_variables_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='talkx_templates'
        AND column_name='custom_variables' AND data_type='ARRAY' AND is_nullable='NO'
    ),
    'history_description_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='talkx_template_versions'
        AND column_name='description' AND data_type='text'
    ),
    'rls_enabled', COALESCE((SELECT bool_and(relrowsecurity) FROM target_relation), false),
    'policy_count', (
      SELECT count(*) FROM pg_policy policy
      JOIN target_relation relation ON relation.oid=policy.polrelid
    ),
    'canonical_select_policy_count', (
      SELECT count(*) FROM pg_policy policy
      JOIN target_relation relation ON relation.oid=policy.polrelid
      WHERE policy.polname='talkx_template_versions_select'
        AND policy.polcmd='r'
        AND policy.polroles=ARRAY['authenticated'::regrole::oid]
    ),
    'constraint_count', (
      SELECT count(*) FROM pg_constraint constraint_row
      JOIN target_relation relation ON relation.oid=constraint_row.conrelid
      WHERE constraint_row.conname IN (
        'talkx_template_versions_version_positive',
        'talkx_template_versions_status_check',
        'talkx_template_versions_media_type_check'
      )
    ),
    'validated_constraint_count', (
      SELECT count(*) FROM pg_constraint constraint_row
      JOIN target_relation relation ON relation.oid=constraint_row.conrelid
      WHERE constraint_row.convalidated
        AND constraint_row.conname IN (
          'talkx_template_versions_version_positive',
          'talkx_template_versions_status_check',
          'talkx_template_versions_media_type_check'
        )
    ),
    'foundation_constraint_count', (
      SELECT count(*) FROM pg_constraint constraint_row
      JOIN target_relation relation ON relation.oid=constraint_row.conrelid
      WHERE (
        constraint_row.conname='talkx_template_versions_pkey'
        AND constraint_row.contype='p'
        AND pg_get_constraintdef(constraint_row.oid)='PRIMARY KEY (id)'
      ) OR (
        constraint_row.conname='talkx_template_versions_template_id_version_number_key'
        AND constraint_row.contype='u'
        AND pg_get_constraintdef(constraint_row.oid)='UNIQUE (template_id, version_number)'
      ) OR (
        constraint_row.conname='talkx_template_versions_template_id_fkey'
        AND constraint_row.contype='f'
        AND constraint_row.confrelid='public.talkx_templates'::regclass
        AND constraint_row.confdeltype='c'
        AND pg_get_constraintdef(constraint_row.oid) LIKE 'FOREIGN KEY (template_id)%'
      ) OR (
        constraint_row.conname='talkx_template_versions_saved_by_fkey'
        AND constraint_row.contype='f'
        AND constraint_row.confrelid='public.profiles'::regclass
        AND constraint_row.confdeltype='n'
        AND pg_get_constraintdef(constraint_row.oid) LIKE 'FOREIGN KEY (saved_by)%'
      )
    ),
    'function_count', (SELECT count(*) FROM expected_functions),
    'safe_function_count', (
      SELECT count(*) FROM expected_functions
      WHERE (proname IN ('update_talkx_template_with_snapshot', 'increment_talkx_template_use')
             AND prosecdef AND safe_path)
         OR (proname IN ('guard_talkx_template_version_immutable', 'guard_talkx_template_update')
             AND NOT prosecdef AND safe_path)
    ),
    'definition_sha256', (
      SELECT encode(sha256(convert_to(COALESCE(string_agg(definition, E'\n' ORDER BY proname), ''), 'UTF8')), 'hex')
      FROM expected_functions
    ),
    'immutable_trigger_count', (
      SELECT count(*) FROM pg_trigger trigger_row
      JOIN target_relation relation ON relation.oid=trigger_row.tgrelid
      WHERE trigger_row.tgname='trg_guard_talkx_template_version_immutable'
        AND NOT trigger_row.tgisinternal
    ),
    'template_update_guard_count', (
      SELECT count(*) FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid='public.talkx_templates'::regclass
        AND trigger_row.tgname='trg_guard_talkx_template_update'
        AND NOT trigger_row.tgisinternal
    ),
    'anon_any_access', COALESCE((SELECT
      has_table_privilege('anon', oid, 'SELECT')
      OR has_table_privilege('anon', oid, 'INSERT')
      OR has_table_privilege('anon', oid, 'UPDATE')
      OR has_table_privilege('anon', oid, 'DELETE')
      OR has_table_privilege('anon', oid, 'TRUNCATE')
      OR has_table_privilege('anon', oid, 'REFERENCES')
      OR has_table_privilege('anon', oid, 'TRIGGER')
      FROM target_relation), false),
    'authenticated_select', COALESCE((SELECT
      has_table_privilege('authenticated', oid, 'SELECT') FROM target_relation
    ), false),
    'authenticated_any_mutation', COALESCE((SELECT
      has_table_privilege('authenticated', oid, 'INSERT')
      OR has_table_privilege('authenticated', oid, 'UPDATE')
      OR has_table_privilege('authenticated', oid, 'DELETE')
      OR has_table_privilege('authenticated', oid, 'TRUNCATE')
      OR has_table_privilege('authenticated', oid, 'REFERENCES')
      OR has_table_privilege('authenticated', oid, 'TRIGGER')
      FROM target_relation), false),
    'authenticated_rpc_execute', COALESCE((SELECT
      has_function_privilege('authenticated', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='update_talkx_template_with_snapshot'
    ), false),
    'anon_rpc_execute', COALESCE((SELECT
      has_function_privilege('anon', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='update_talkx_template_with_snapshot'
    ), false),
    'authenticated_counter_execute', COALESCE((SELECT
      has_function_privilege('authenticated', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='increment_talkx_template_use'
    ), false),
    'anon_counter_execute', COALESCE((SELECT
      has_function_privilege('anon', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='increment_talkx_template_use'
    ), false),
    'authenticated_guard_execute', COALESCE((SELECT
      has_function_privilege('authenticated', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='guard_talkx_template_version_immutable'
    ), false),
    'authenticated_update_guard_execute', COALESCE((SELECT
      has_function_privilege('authenticated', oid, 'EXECUTE')
      FROM expected_functions WHERE proname='guard_talkx_template_update'
    ), false)
  ) AS value
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
