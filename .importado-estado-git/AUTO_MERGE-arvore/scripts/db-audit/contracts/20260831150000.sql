              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH source_counts AS (
                  SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/') AS legacy_count
                  FROM public.messages
                  UNION ALL
                  SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/')
                  FROM public.scheduled_messages
                  UNION ALL
                  SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/')
                  FROM public.team_messages
                  UNION ALL
                  SELECT count(*) FILTER (WHERE file_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/')
                  FROM public.knowledge_base_files
                ), payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'source_count', count(*),
                    'legacy_signed_url_count', sum(legacy_count)
                  ) AS value
                  FROM source_counts
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text
                FROM payload;")
