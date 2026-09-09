WITH expected_functions AS (
  SELECT procedure.oid, procedure.proname, procedure.prosecdef,
         COALESCE('search_path=public, pg_temp' = ANY(procedure.proconfig), false) AS safe_path,
         pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND (
      (procedure.proname = 'enqueue_outbound_message'
       AND pg_get_function_identity_arguments(procedure.oid) =
         'p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid')
      OR (procedure.proname = 'claim_outbound_message'
       AND pg_get_function_identity_arguments(procedure.oid) =
         'p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer')
      OR (procedure.proname = 'complete_outbound_message'
       AND pg_get_function_identity_arguments(procedure.oid) =
         'p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text')
      OR (procedure.proname = 'fail_outbound_message'
       AND pg_get_function_identity_arguments(procedure.oid) =
         'p_message_id uuid, p_claim_token uuid, p_retryable boolean')
      OR (procedure.proname = 'close_conversation_atomic'
       AND pg_get_function_identity_arguments(procedure.oid) =
         'p_contact_id uuid, p_client_request_id uuid, p_close_reason text, p_outcome text, p_classification text, p_notes text')
    )
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'message_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'messages'
        AND column_name IN (
          'client_message_id', 'delivery_claim_token', 'delivery_claimed_at',
          'delivery_claim_expires_at', 'delivery_claimed_by',
          'delivery_attempt_count'
        )
    ),
    'closure_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'conversation_closures'
        AND column_name = 'client_request_id'
    ),
    'event_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'conversation_events'
        AND column_name = 'closure_id'
    ),
    'validated_constraint_count', (
      SELECT count(*) FROM pg_constraint
      WHERE convalidated AND conname IN (
        'messages_delivery_attempt_count_nonnegative',
        'messages_delivery_claim_state',
        'conversation_events_closure_id_fkey',
        'conversation_events_closure_type_check'
      )
    ),
    'index_count', (
      SELECT count(*) FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'i'
        AND relation.relname IN (
          'ux_messages_contact_client_message_id',
          'idx_messages_delivery_claimable',
          'ux_conversation_closures_contact_request',
          'ux_conversation_events_closure_id'
        )
    ),
    'function_count', (SELECT count(*) FROM expected_functions),
    'safe_function_count', (
      SELECT count(*) FROM expected_functions WHERE prosecdef AND safe_path
    ),
    'definition_sha256', (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(definition, E'\n' ORDER BY proname), ''),
        'UTF8'
      )), 'hex') FROM expected_functions
    ),
    'authenticated_enqueue', COALESCE((SELECT has_function_privilege(
      'authenticated', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'enqueue_outbound_message'), false),
    'authenticated_close', COALESCE((SELECT has_function_privilege(
      'authenticated', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'close_conversation_atomic'), false),
    'authenticated_privileged_delivery', COALESCE((SELECT bool_or(
      has_function_privilege('authenticated', oid, 'EXECUTE')
    ) FROM expected_functions WHERE proname IN (
      'claim_outbound_message', 'complete_outbound_message',
      'fail_outbound_message'
    )), false),
    'anon_any_execute', COALESCE((SELECT bool_or(
      has_function_privilege('anon', oid, 'EXECUTE')
    ) FROM expected_functions), false),
    'service_delivery_count', (
      SELECT count(*) FROM expected_functions
      WHERE proname IN (
        'claim_outbound_message', 'complete_outbound_message',
        'fail_outbound_message'
      ) AND has_function_privilege('service_role', oid, 'EXECUTE')
    ),
    'custom_guc_reference_count', (
      SELECT count(*) FROM expected_functions
      WHERE definition ~* '(current_setting|set_config)\s*\(\s*''app\.'
    )
  ) AS value
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
