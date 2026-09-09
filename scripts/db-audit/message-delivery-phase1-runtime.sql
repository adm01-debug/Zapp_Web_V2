WITH expected_functions AS (
  SELECT procedure.oid, procedure.proname, procedure.prosecdef,
         procedure.proowner,
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
      OR (procedure.proname IN (
            'guard_message_delivery_internal_fields',
            'guard_conversation_closure_request_id',
            'guard_conversation_event_closure_id'
          )
       AND pg_get_function_identity_arguments(procedure.oid) = '')
    )
), expected_triggers AS (
  SELECT trigger.oid, trigger.tgname,
         pg_get_triggerdef(trigger.oid, true) AS definition
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_proc AS handler ON handler.oid = trigger.tgfoid
  WHERE namespace.nspname = 'public'
    AND NOT trigger.tgisinternal
    AND trigger.tgenabled = 'O'
    AND trigger.tgtype = 23
    AND (
      (relation.relname = 'messages'
       AND trigger.tgname = 'trg_guard_message_delivery_internal_fields'
       AND handler.proname = 'guard_message_delivery_internal_fields')
      OR (relation.relname = 'conversation_closures'
       AND trigger.tgname = 'trg_guard_conversation_closure_request_id'
       AND handler.proname = 'guard_conversation_closure_request_id')
      OR (relation.relname = 'conversation_events'
       AND trigger.tgname = 'trg_guard_conversation_event_closure_id'
      AND handler.proname = 'guard_conversation_event_closure_id')
    )
), expected_columns AS (
  SELECT column_contract.table_name, column_contract.column_name
  FROM (VALUES
    ('messages', 'client_message_id', 'uuid', 'YES', NULL::text),
    ('messages', 'delivery_claim_token', 'uuid', 'YES', NULL::text),
    ('messages', 'delivery_claimed_at', 'timestamp with time zone', 'YES', NULL::text),
    ('messages', 'delivery_claim_expires_at', 'timestamp with time zone', 'YES', NULL::text),
    ('messages', 'delivery_claimed_by', 'text', 'YES', NULL::text),
    ('messages', 'delivery_last_claim_token', 'uuid', 'YES', NULL::text),
    ('messages', 'delivery_attempt_count', 'integer', 'NO', '0'::text),
    ('conversation_closures', 'client_request_id', 'uuid', 'YES', NULL::text),
    ('conversation_events', 'closure_id', 'uuid', 'YES', NULL::text)
  ) AS column_contract(
    table_name, column_name, data_type, is_nullable, column_default
  )
  JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = column_contract.table_name
   AND actual.column_name = column_contract.column_name
   AND actual.data_type = column_contract.data_type
   AND actual.is_nullable = column_contract.is_nullable
   AND actual.column_default IS NOT DISTINCT FROM column_contract.column_default
), expected_constraints AS (
  SELECT constraint_row.oid, constraint_row.conname,
         pg_get_constraintdef(constraint_row.oid, true) AS definition
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.convalidated AND (
    (constraint_row.conrelid = to_regclass('public.messages')
     AND constraint_row.conname IN (
       'messages_delivery_attempt_count_nonnegative',
       'messages_delivery_claim_state'
     ))
    OR (constraint_row.conrelid = to_regclass('public.conversation_events')
     AND constraint_row.conname IN (
       'conversation_events_closure_id_fkey',
       'conversation_events_closure_type_check'
     ))
  )
), expected_indexes AS (
  SELECT relation.oid, relation.relname,
         pg_get_indexdef(relation.oid) AS definition
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relkind = 'i'
    AND relation.relname IN (
      'ux_messages_contact_client_message_id',
      'idx_messages_delivery_claimable',
      'ux_conversation_closures_contact_request',
      'ux_conversation_events_closure_id'
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
          'delivery_last_claim_token', 'delivery_attempt_count'
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
    'column_contract_count', (SELECT count(*) FROM expected_columns),
    'validated_constraint_count', (SELECT count(*) FROM expected_constraints),
    'index_count', (SELECT count(*) FROM expected_indexes),
    'function_count', (SELECT count(*) FROM expected_functions),
    'safe_api_function_count', (
      SELECT count(*) FROM expected_functions
      WHERE proname NOT LIKE 'guard_%' AND prosecdef AND safe_path
    ),
    'internal_guard_function_count', (
      SELECT count(*) FROM expected_functions
      WHERE proname LIKE 'guard_%' AND NOT prosecdef AND safe_path
    ),
    'internal_guard_trigger_count', (
      SELECT count(*) FROM expected_triggers
    ),
    'trusted_owner_function_count', (
      SELECT count(*) FROM expected_functions
      WHERE pg_get_userbyid(proowner) = 'postgres'
    ),
    'trigger_name_collision_count', (
      SELECT count(*)
      FROM pg_trigger AS trigger
      JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND NOT trigger.tgisinternal
        AND trigger.tgname IN (
          'trg_guard_message_delivery_internal_fields',
          'trg_guard_conversation_closure_request_id',
          'trg_guard_conversation_event_closure_id'
        )
        AND NOT EXISTS (
          SELECT 1 FROM expected_triggers expected
          WHERE expected.oid = trigger.oid
        )
    ),
    'constraint_name_collision_count', (
      SELECT count(*)
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conname IN (
        'messages_delivery_attempt_count_nonnegative',
        'messages_delivery_claim_state',
        'conversation_events_closure_id_fkey',
        'conversation_events_closure_type_check'
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected_constraints expected
        WHERE expected.oid = constraint_row.oid
      )
    ),
    'function_name_collision_count', (
      SELECT count(*)
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname IN (
          'enqueue_outbound_message', 'claim_outbound_message',
          'complete_outbound_message', 'fail_outbound_message',
          'close_conversation_atomic',
          'guard_message_delivery_internal_fields',
          'guard_conversation_closure_request_id',
          'guard_conversation_event_closure_id'
        )
        AND NOT EXISTS (
          SELECT 1 FROM expected_functions expected
          WHERE expected.oid = procedure.oid
        )
    ),
    'definition_sha256', (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(definition, E'\n' ORDER BY proname), ''),
        'UTF8'
      )), 'hex') FROM expected_functions
    ),
    'constraint_definition_sha256', (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(conname || E'\x1f' || definition, E'\n'
          ORDER BY conname), ''), 'UTF8'
      )), 'hex') FROM expected_constraints
    ),
    'index_definition_sha256', (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(relname || E'\x1f' || definition, E'\n'
          ORDER BY relname), ''), 'UTF8'
      )), 'hex') FROM expected_indexes
    ),
    'trigger_definition_sha256', (
      SELECT encode(sha256(convert_to(
        COALESCE(string_agg(tgname || E'\x1f' || definition, E'\n'
          ORDER BY tgname), ''), 'UTF8'
      )), 'hex') FROM expected_triggers
    ),
    'authenticated_enqueue', COALESCE((SELECT has_function_privilege(
      'authenticated', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'enqueue_outbound_message'), false),
    'authenticated_close', COALESCE((SELECT has_function_privilege(
      'authenticated', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'close_conversation_atomic'), false),
    'service_enqueue', COALESCE((SELECT has_function_privilege(
      'service_role', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'enqueue_outbound_message'), false),
    'service_close', COALESCE((SELECT has_function_privilege(
      'service_role', oid, 'EXECUTE'
    ) FROM expected_functions WHERE proname = 'close_conversation_atomic'), false),
    'authenticated_privileged_delivery', COALESCE((SELECT bool_or(
      has_function_privilege('authenticated', oid, 'EXECUTE')
    ) FROM expected_functions WHERE proname IN (
      'claim_outbound_message', 'complete_outbound_message',
      'fail_outbound_message'
    )), false),
    'authenticated_internal_guard_execute', COALESCE((SELECT bool_or(
      has_function_privilege('authenticated', oid, 'EXECUTE')
    ) FROM expected_functions WHERE proname LIKE 'guard_%'), false),
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
