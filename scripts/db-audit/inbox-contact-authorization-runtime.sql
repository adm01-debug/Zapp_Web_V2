WITH expected_functions AS (
  SELECT p.oid, p.proname, p.prosecdef,
         pg_get_functiondef(p.oid) AS body,
         COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS safe_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND (
      (p.proname='get_profile_id_for_user'
        AND pg_get_function_identity_arguments(p.oid)='_user_id uuid')
      OR (p.proname='get_visible_agent_ids'
        AND pg_get_function_identity_arguments(p.oid)='_user_id uuid')
      OR (p.proname='is_contact_visible_to_user'
        AND pg_get_function_identity_arguments(p.oid)='_contact_id uuid, _user_id uuid')
      OR (p.proname='get_conversation_tab_counts'
        AND pg_get_function_identity_arguments(p.oid)='p_contact_id uuid')
    )
), note_policies AS (
  SELECT oid, polname, polcmd, polroles, polrelid, polqual, polwithcheck
  FROM pg_policy
  WHERE polrelid='public.contact_notes'::regclass
), identity_triggers AS (
  SELECT t.oid, t.tgname
  FROM pg_trigger t
  WHERE t.tgrelid='public.contact_notes'::regclass
    AND t.tgname='guard_contact_note_identity'
    AND NOT t.tgisinternal
), definition_material AS (
  SELECT string_agg(definition, E'\n-- contract boundary --\n' ORDER BY kind, object_name) AS value
  FROM (
    SELECT 'function' AS kind,
           proname || ':' || pg_get_function_identity_arguments(oid) AS object_name,
           pg_get_functiondef(oid) AS definition
    FROM expected_functions
    UNION ALL
    SELECT 'policy', polname,
           concat_ws('|', polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid))
    FROM note_policies
    UNION ALL
    SELECT 'trigger', tgname, pg_get_triggerdef(oid, true)
    FROM identity_triggers
  ) definitions
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::int / 10000,
    'database', current_database(),
    'note_table_count', (
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='contact_notes'
        AND c.relkind IN ('r','p')
    ),
    'note_rls_enabled', COALESCE((
      SELECT c.relrowsecurity FROM pg_class c
      WHERE c.oid='public.contact_notes'::regclass
    ), false),
    'function_count', (SELECT count(*) FROM expected_functions),
    'safe_function_count', (
      SELECT count(*) FROM expected_functions WHERE prosecdef AND safe_path
    ),
    'caller_bound_count', (
      SELECT count(*) FROM expected_functions
      WHERE proname IN (
        'get_profile_id_for_user','get_visible_agent_ids','is_contact_visible_to_user'
      ) AND position('_user_id = auth.uid()' in lower(body)) > 0
    ),
    'rpc_authorized_count', (
      SELECT count(*) FROM expected_functions
      WHERE proname='get_conversation_tab_counts'
        AND position('not public.is_contact_visible_to_user(p_contact_id, auth.uid())' in lower(body)) > 0
        AND position('42501' in body) > 0
    ),
    'policy_count', (SELECT count(*) FROM note_policies),
    'policy_signature_count', (
      SELECT count(*) FROM note_policies
      WHERE polroles=ARRAY['authenticated'::regrole::oid]
        AND (polname, polcmd) IN (
          ('contact_notes_select_policy','r'),
          ('contact_notes_insert_policy','a'),
          ('contact_notes_update_policy','w'),
          ('contact_notes_delete_policy','d')
        )
    ),
    'identity_trigger_count', (
      SELECT count(*) FROM identity_triggers
    ),
    'definition_sha256', encode(sha256(convert_to(
      COALESCE((SELECT value FROM definition_material), ''), 'UTF8'
    )), 'hex'),
    'authenticated_api_execute_count', (
      SELECT count(*) FROM expected_functions
      WHERE has_function_privilege('authenticated', oid, 'EXECUTE')
    ),
    'anon_api_execute_count', (
      SELECT count(*) FROM expected_functions
      WHERE has_function_privilege('anon', oid, 'EXECUTE')
    ),
    'guard_authenticated_execute', COALESCE(has_function_privilege(
      'authenticated', to_regprocedure('public.guard_contact_note_identity()'), 'EXECUTE'
    ), false),
    'guard_anon_execute', COALESCE(has_function_privilege(
      'anon', to_regprocedure('public.guard_contact_note_identity()'), 'EXECUTE'
    ), false),
    'anon_note_access', has_table_privilege(
      'anon', 'public.contact_notes',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
    ),
    'authenticated_note_crud',
      has_table_privilege('authenticated','public.contact_notes','SELECT')
      AND has_table_privilege('authenticated','public.contact_notes','INSERT')
      AND has_table_privilege('authenticated','public.contact_notes','UPDATE')
      AND has_table_privilege('authenticated','public.contact_notes','DELETE'),
    'authenticated_note_extra', has_table_privilege(
      'authenticated', 'public.contact_notes',
      'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
    ),
    'service_note_crud',
      has_table_privilege('service_role','public.contact_notes','SELECT')
      AND has_table_privilege('service_role','public.contact_notes','INSERT')
      AND has_table_privilege('service_role','public.contact_notes','UPDATE')
      AND has_table_privilege('service_role','public.contact_notes','DELETE'),
    'service_note_extra', has_table_privilege(
      'service_role', 'public.contact_notes',
      'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
    )
  ) AS value
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text FROM payload;
