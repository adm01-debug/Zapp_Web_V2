WITH target_functions AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    p.proconfig,
    r.rolname AS owner_name,
    pg_get_functiondef(p.oid) AS definition,
    p.proacl,
    p.proowner
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_roles AS r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname IN ('record_incoming_call_event', 'persist_sentiment_alert')
), expected_functions AS (
  SELECT *
  FROM target_functions
  WHERE (proname = 'record_incoming_call_event'
      AND identity_args = 'p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean')
     OR (proname = 'persist_sentiment_alert'
      AND identity_args = 'p_analysis_id uuid, p_contact_id uuid, p_recipient_user_id uuid, p_notification_title text, p_notification_message text, p_details jsonb')
), relation_state AS (
  SELECT
    count(*) FILTER (WHERE c.relname IN ('calls', 'notifications', 'audit_logs')) AS base_table_count,
    count(*) FILTER (WHERE c.relname = 'calls') AS calls_table_count
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
), column_state AS (
  SELECT count(*) AS provider_event_column_count
  FROM pg_attribute AS a
  JOIN pg_class AS c ON c.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'calls'
    AND a.attname = 'provider_event_id'
    AND a.atttypid = 'text'::regtype
    AND NOT a.attisdropped
), constraint_state AS (
  SELECT
    count(*) AS constraint_count,
    count(*) FILTER (WHERE convalidated) AS validated_constraint_count
  FROM pg_constraint
  WHERE conrelid = to_regclass('public.calls')
    AND conname = 'calls_provider_event_id_length'
    AND contype = 'c'
), index_state AS (
  SELECT
    count(*) AS index_count,
    count(*) FILTER (
      WHERE i.indisunique AND i.indisvalid AND i.indisready
        AND pg_get_expr(i.indpred, i.indrelid) = '(provider_event_id IS NOT NULL)'
    ) AS valid_unique_partial_index_count
  FROM pg_class AS idx
  JOIN pg_namespace AS n ON n.oid = idx.relnamespace
  JOIN pg_index AS i ON i.indexrelid = idx.oid
  WHERE n.nspname = 'public'
    AND idx.relname = 'calls_connection_provider_event_unique'
), function_state AS (
  SELECT
    (SELECT count(*) FROM target_functions) AS function_name_count,
    count(*) AS function_signature_count,
    count(*) FILTER (WHERE prosecdef) AS security_definer_count,
    count(*) FILTER (WHERE 'search_path=public, pg_temp' = ANY(proconfig)) AS safe_path_count,
    count(*) FILTER (WHERE owner_name IN ('postgres', 'supabase_admin')) AS trusted_owner_count,
    count(*) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')) AS anon_execute_count,
    count(*) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')) AS authenticated_execute_count,
    count(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE')) AS service_execute_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
    ) AS public_execute_count,
    encode(sha256(convert_to(COALESCE(string_agg(
      proname || '(' || identity_args || '):' || definition,
      E'\n' ORDER BY proname
    ), ''), 'UTF8')), 'hex') AS function_definition_sha256
  FROM expected_functions
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'base_table_count', rs.base_table_count,
    'calls_table_count', rs.calls_table_count,
    'provider_event_column_count', cs.provider_event_column_count,
    'constraint_count', cons.constraint_count,
    'validated_constraint_count', cons.validated_constraint_count,
    'index_count', idx.index_count,
    'valid_unique_partial_index_count', idx.valid_unique_partial_index_count,
    'function_name_count', fs.function_name_count,
    'function_signature_count', fs.function_signature_count,
    'security_definer_count', fs.security_definer_count,
    'safe_path_count', fs.safe_path_count,
    'trusted_owner_count', fs.trusted_owner_count,
    'public_execute_count', fs.public_execute_count,
    'anon_execute_count', fs.anon_execute_count,
    'authenticated_execute_count', fs.authenticated_execute_count,
    'service_execute_count', fs.service_execute_count,
    'function_definition_sha256', fs.function_definition_sha256
  ) AS value
  FROM relation_state AS rs
  CROSS JOIN column_state AS cs
  CROSS JOIN constraint_state AS cons
  CROSS JOIN index_state AS idx
  CROSS JOIN function_state AS fs
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
