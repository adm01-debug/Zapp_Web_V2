-- Structural, data-free attestation for the ordered Talk X recovery rollout.
-- The result deliberately contains only aggregate metadata and a digest so it
-- is safe to publish in GitHub Actions logs.
WITH expected_functions(signature, security_definer, safe_path, auth_execute, service_execute) AS (
  VALUES
    ('public.claim_talkx_recipient(uuid,uuid,text,integer)', true, true, false, true),
    ('public.complete_talkx_recipient(uuid,uuid,text,text)', true, true, false, true),
    ('public.replace_talkx_draft_recipients(uuid,uuid[])', true, true, true, false),
    ('public.enforce_talkx_campaign_mutability()', false, true, false, false),
    ('public.enforce_talkx_recipient_snapshot_mutability()', false, true, false, false),
    ('public.transition_talkx_campaign(uuid,text)', true, true, false, true),
    ('public.complete_talkx_campaign_if_drained(uuid)', true, true, false, true),
    ('public.is_valid_talkx_schedule_timezone(text)', false, true, true, true),
    ('public.talkx_recipient_is_suppressed(uuid,text)', true, true, false, true),
    ('public.record_talkx_recipient_sent(uuid,uuid,text)', true, true, false, true),
    ('public.record_talkx_recipient_delivered(text,uuid)', true, true, false, true),
    ('public.release_talkx_recipient_claim(uuid,uuid)', true, true, false, true),
    ('public.mark_talkx_recipient_dispatch_started(uuid,uuid)', true, true, false, true),
    ('public.persist_talkx_recipient_message_snapshot(uuid,uuid,text,text,text,uuid)', true, true, false, true),
    ('public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)', true, true, true, false)
), function_state AS (
  SELECT expected.*,
         procedure.oid,
         procedure.prosecdef,
         COALESCE(
           'search_path=public, pg_temp' = ANY(procedure.proconfig)
           OR 'search_path=pg_catalog' = ANY(procedure.proconfig),
           false
         ) AS has_safe_path
  FROM expected_functions AS expected
  LEFT JOIN LATERAL (
    SELECT proc.oid, proc.prosecdef, proc.proconfig
    FROM pg_proc AS proc
    WHERE proc.oid = to_regprocedure(expected.signature)
  ) AS procedure ON true
), trigger_state AS (
  SELECT trigger.tgname,
         trigger.tgenabled,
         pg_get_triggerdef(trigger.oid, true) AS definition
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('talkx_campaigns', 'talkx_recipients')
    AND trigger.tgname IN (
      'enforce_talkx_campaign_mutability',
      'enforce_talkx_recipient_snapshot_mutability'
    )
    AND NOT trigger.tgisinternal
), constraint_state AS (
  SELECT constraint_record.conname,
         constraint_record.convalidated,
         pg_get_constraintdef(constraint_record.oid, true) AS definition
  FROM pg_constraint AS constraint_record
  WHERE constraint_record.conrelid IN (
      'public.talkx_campaigns'::regclass,
      'public.talkx_recipients'::regclass
    )
    AND constraint_record.conname IN (
      'talkx_recipients_delivery_claim_state', 'talkx_recipients_status_check',
      'talkx_recipients_external_id_bounded', 'talkx_recipients_media_snapshot_shape',
      'talkx_campaigns_schedule_timezone_valid', 'talkx_campaigns_send_window_valid',
      'talkx_campaigns_revision_positive'
    )
), index_state AS (
  SELECT index_relation.relname,
         index_record.indisvalid,
         index_record.indisready,
         pg_get_indexdef(index_relation.oid, 0, true) AS definition
  FROM pg_index AS index_record
  JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
  JOIN pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_relation.relname IN (
      'idx_talkx_recipients_claimable', 'idx_talkx_recipients_external_id',
      'talkx_campaigns_creator_draft_creation_key_uidx'
    )
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'table_count', (
      SELECT count(*)
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('talkx_campaigns', 'talkx_recipients')
        AND relation.relkind IN ('r', 'p')
    ),
    'rls_table_count', (
      SELECT count(*)
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('talkx_campaigns', 'talkx_recipients')
        AND relation.relrowsecurity
    ),
    'recipient_rollout_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'talkx_recipients'
        AND column_name IN (
          'delivery_claim_token', 'delivery_claimed_at', 'delivery_claim_expires_at',
          'delivery_claimed_by', 'delivery_attempt_count', 'delivery_last_claim_token',
          'provider_dispatch_started_at', 'variant_id_snapshot', 'message_snapshot_at',
          'media_url_snapshot', 'media_type_snapshot'
        )
    ),
    'campaign_rollout_column_count', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
        AND column_name IN (
          'outcome_unknown_count', 'schedule_timezone', 'draft_creation_key', 'revision'
        )
    ),
    'function_count', (SELECT count(*) FROM function_state WHERE oid IS NOT NULL),
    'security_definer_match_count', (
      SELECT count(*) FROM function_state
      WHERE oid IS NOT NULL AND prosecdef = security_definer
    ),
    'safe_path_count', (
      SELECT count(*) FROM function_state WHERE oid IS NOT NULL AND has_safe_path = safe_path
    ),
    'anonymous_execute_count', (
      SELECT count(*) FROM function_state
      WHERE oid IS NOT NULL AND has_function_privilege('anon', oid, 'EXECUTE')
    ),
    'authenticated_execute_match_count', (
      SELECT count(*) FROM function_state
      WHERE oid IS NOT NULL
        AND has_function_privilege('authenticated', oid, 'EXECUTE') = auth_execute
    ),
    'service_execute_match_count', (
      SELECT count(*) FROM function_state
      WHERE oid IS NOT NULL
        AND has_function_privilege('service_role', oid, 'EXECUTE') = service_execute
    ),
    'function_definition_sha256', (
      SELECT encode(sha256(convert_to(COALESCE(string_agg(
        signature || E'\n' || pg_get_functiondef(oid), E'\n' ORDER BY signature
      ), ''), 'UTF8')), 'hex')
      FROM function_state WHERE oid IS NOT NULL
    ),
    'trigger_count', (SELECT count(*) FROM trigger_state),
    'enabled_trigger_count', (
      SELECT count(*) FROM trigger_state WHERE tgenabled = 'O'
    ),
    'trigger_definition_sha256', (
      SELECT encode(sha256(convert_to(COALESCE(string_agg(
        tgname || E'\n' || definition, E'\n' ORDER BY tgname
      ), ''), 'UTF8')), 'hex') FROM trigger_state
    ),
    'constraint_count', (SELECT count(*) FROM constraint_state),
    'validated_constraint_count', (
      SELECT count(*) FROM constraint_state WHERE convalidated
    ),
    'constraint_definition_sha256', (
      SELECT encode(sha256(convert_to(COALESCE(string_agg(
        conname || E'\n' || definition, E'\n' ORDER BY conname
      ), ''), 'UTF8')), 'hex') FROM constraint_state
    ),
    'index_count', (SELECT count(*) FROM index_state),
    'valid_ready_index_count', (
      SELECT count(*) FROM index_state WHERE indisvalid AND indisready
    ),
    'index_definition_sha256', (
      SELECT encode(sha256(convert_to(COALESCE(string_agg(
        relname || E'\n' || definition, E'\n' ORDER BY relname
      ), ''), 'UTF8')), 'hex') FROM index_state
    )
  ) AS value
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
