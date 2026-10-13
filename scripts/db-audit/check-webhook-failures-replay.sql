-- Guard do contrato de REPLAY da dead-letter (webhook_failures).
--
-- Confere o que a migration 20261012120000 acrescentou e, principalmente, que o
-- ACL continua fechado: o evento reprocessável (external_id + replay_payload)
-- só é alcançável por service_role. Imprime 'OK: ...' e sai 0 quando tudo bate;
-- levanta exceção com 'FALHA: ...' caso contrário (o .test.sh usa
-- ON_ERROR_STOP, então a exceção é o status não-zero).
DO $$
DECLARE
  problemas text[] := '{}';
  tipo_external text;
  tipo_replay text;
  tem_indice boolean;
  contagem integer;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO tipo_external
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'webhook_failures' AND c.relnamespace = 'public'::regnamespace
     AND a.attname = 'external_id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF tipo_external IS DISTINCT FROM 'text' THEN
    problemas := array_append(problemas, format('external_id=%s (esperado text)', coalesce(tipo_external, 'ausente')));
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO tipo_replay
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'webhook_failures' AND c.relnamespace = 'public'::regnamespace
     AND a.attname = 'replay_payload' AND a.attnum > 0 AND NOT a.attisdropped;
  IF tipo_replay IS DISTINCT FROM 'jsonb' THEN
    problemas := array_append(problemas, format('replay_payload=%s (esperado jsonb)', coalesce(tipo_replay, 'ausente')));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'webhook_failures_replay_pendente_idx'
       AND indexdef ILIKE '%not resolved%'
  ) INTO tem_indice;
  IF NOT tem_indice THEN
    problemas := array_append(problemas, 'indice webhook_failures_replay_pendente_idx ausente ou sem o filtro NOT resolved');
  END IF;

  -- (se a coluna não existir, has_column_privilege levanta: por isso o gate).
  IF tipo_replay IS NOT NULL AND NOT has_column_privilege('service_role', 'public.webhook_failures', 'replay_payload', 'INSERT') THEN
    problemas := array_append(problemas, 'service_role sem INSERT em replay_payload');
  END IF;
  IF tipo_external IS NOT NULL AND NOT has_column_privilege('service_role', 'public.webhook_failures', 'external_id', 'UPDATE') THEN
    problemas := array_append(problemas, 'service_role sem UPDATE em external_id');
  END IF;
  IF tipo_replay IS NOT NULL AND (
    has_column_privilege('anon', 'public.webhook_failures', 'replay_payload', 'SELECT') OR
    has_column_privilege('anon', 'public.webhook_failures', 'replay_payload', 'UPDATE')
  ) THEN
    problemas := array_append(problemas, 'anon alcanca replay_payload');
  END IF;
  IF tipo_external IS NOT NULL AND (
    has_column_privilege('authenticated', 'public.webhook_failures', 'external_id', 'SELECT') OR
    has_column_privilege('authenticated', 'public.webhook_failures', 'external_id', 'INSERT')
  ) THEN
    problemas := array_append(problemas, 'authenticated alcanca external_id');
  END IF;
  IF tipo_replay IS NOT NULL AND has_column_privilege('authenticated', 'public.webhook_failures', 'replay_payload', 'UPDATE') THEN
    problemas := array_append(problemas, 'authenticated alcanca replay_payload (UPDATE)');
  END IF;

  -- Prova viva (papel real): service_role grava e lê o evento reprocessável.
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.webhook_failures (endpoint, external_id, replay_payload, payload_sha256, error_message)
    VALUES ('evolution-webhook', 'MSG-GUARD', '{"p_external_id":"MSG-GUARD"}'::jsonb, repeat('a', 64), 'prova do guard');
    SELECT count(*) INTO contagem FROM public.webhook_failures WHERE external_id = 'MSG-GUARD';
    IF contagem <> 1 THEN
      problemas := array_append(problemas, 'service_role nao conseguiu ler o evento reprocessavel gravado');
    END IF;
    DELETE FROM public.webhook_failures WHERE external_id = 'MSG-GUARD';
  EXCEPTION WHEN others THEN
    problemas := array_append(problemas, format('service_role nao conseguiu gravar o evento reprocessavel (%s)', SQLSTATE));
  END;
  RESET ROLE;

  -- Prova viva (papel real): anon é NEGADO ao ler a dead-letter.
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO contagem FROM public.webhook_failures;
    problemas := array_append(problemas, 'anon conseguiu ler webhook_failures');
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  -- Prova viva (papel real): authenticated é NEGADO ao gravar na dead-letter.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.webhook_failures (endpoint, error_message) VALUES ('evolution-webhook', 'negado');
    problemas := array_append(problemas, 'authenticated conseguiu gravar em webhook_failures');
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  IF coalesce(array_length(problemas, 1), 0) > 0 THEN
    RAISE EXCEPTION 'FALHA: contrato da dead-letter reprocessavel: %', array_to_string(problemas, '; ');
  END IF;

  RAISE NOTICE 'OK: webhook_failures reprocessavel e restrita';
END $$;
