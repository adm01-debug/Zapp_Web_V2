-- Fecha os gaps de rollout do CRM sem fabricar evidência histórica:
-- 1. normaliza/quarentena linhas legadas incompatíveis;
-- 2. valida formalmente as cinco constraints adicionadas NOT VALID;
-- 3. aplica least privilege em crm_contact_links;
-- 4. fornece merge de contatos transacional e extensível por catálogo.

INSERT INTO public.feature_flags(key, enabled, description)
VALUES ('crm.integration', false, 'Kill switch runtime da integracao com o CRM externo')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.crm_sync_outbox
  DROP CONSTRAINT crm_sync_outbox_phone_state,
  ADD CONSTRAINT crm_sync_outbox_phone_state CHECK (
    normalized_phone IS NOT NULL
    OR (status = 'dead_letter' AND last_error_code IN ('INVALID_PHONE', 'CONTACT_DELETED'))
  ) NOT VALID;

WITH classified AS (
  SELECT
    id,
    status,
    octet_length(payload::text) > 20000 AS oversized_payload,
    normalized_phone IS NULL AS invalid_phone,
    (external_interaction_id IS NOT NULL AND length(external_interaction_id) NOT BETWEEN 1 AND 200)
      OR (external_contact_id IS NOT NULL AND length(external_contact_id) NOT BETWEEN 1 AND 200)
      OR (external_company_id IS NOT NULL AND length(external_company_id) NOT BETWEEN 1 AND 200)
      AS invalid_external_ids,
    status = 'succeeded' AND (
      completed_at IS NULL OR external_interaction_id IS NULL OR external_contact_id IS NULL
    ) AS invalid_success,
    (
      status = 'processing' AND (locked_at IS NULL OR locked_by IS NULL OR lease_token IS NULL)
    ) OR (
      status <> 'processing' AND (locked_at IS NOT NULL OR locked_by IS NOT NULL OR lease_token IS NOT NULL)
    ) AS invalid_lease
  FROM public.crm_sync_outbox
), normalized AS (
  SELECT
    id,
    CASE
      WHEN invalid_phone OR oversized_payload OR invalid_external_ids OR invalid_success THEN 'dead_letter'
      WHEN invalid_lease AND status = 'processing' THEN 'failed'
      ELSE NULL
    END AS forced_status,
    CASE
      WHEN invalid_phone THEN 'INVALID_PHONE'
      WHEN oversized_payload THEN 'LEGACY_PAYLOAD_OVERSIZE'
      WHEN invalid_external_ids THEN 'LEGACY_EXTERNAL_ID_INVALID'
      WHEN invalid_success THEN 'LEGACY_INVALID_SUCCESS'
      WHEN invalid_lease THEN 'LEGACY_INVALID_LEASE'
      ELSE NULL
    END AS quarantine_reason,
    oversized_payload,
    invalid_external_ids
  FROM classified
  WHERE oversized_payload OR invalid_phone OR invalid_external_ids OR invalid_success OR invalid_lease
)
UPDATE public.crm_sync_outbox q
SET
  status = COALESCE(n.forced_status, q.status),
  payload = CASE WHEN n.oversized_payload THEN jsonb_build_object(
    'quarantined', true,
    'reason', n.quarantine_reason,
    'original_sha256', encode(digest(q.payload::text, 'sha256'), 'hex')
  ) ELSE q.payload END,
  external_interaction_id = CASE
    WHEN q.external_interaction_id IS NOT NULL AND length(q.external_interaction_id) NOT BETWEEN 1 AND 200 THEN NULL
    ELSE q.external_interaction_id END,
  external_contact_id = CASE
    WHEN q.external_contact_id IS NOT NULL AND length(q.external_contact_id) NOT BETWEEN 1 AND 200 THEN NULL
    ELSE q.external_contact_id END,
  external_company_id = CASE
    WHEN q.external_company_id IS NOT NULL AND length(q.external_company_id) NOT BETWEEN 1 AND 200 THEN NULL
    ELSE q.external_company_id END,
  locked_at = CASE WHEN COALESCE(n.forced_status, q.status) = 'processing' THEN q.locked_at ELSE NULL END,
  locked_by = CASE WHEN COALESCE(n.forced_status, q.status) = 'processing' THEN q.locked_by ELSE NULL END,
  lease_token = CASE WHEN COALESCE(n.forced_status, q.status) = 'processing' THEN q.lease_token ELSE NULL END,
  available_at = CASE WHEN n.forced_status = 'failed' THEN now() ELSE q.available_at END,
  last_error_code = left(n.quarantine_reason, 100),
  updated_at = now()
FROM normalized n
WHERE q.id = n.id;

ALTER TABLE public.crm_sync_outbox VALIDATE CONSTRAINT crm_sync_outbox_payload_size;
ALTER TABLE public.crm_sync_outbox VALIDATE CONSTRAINT crm_sync_outbox_external_ids_bounded;
ALTER TABLE public.crm_sync_outbox VALIDATE CONSTRAINT crm_sync_outbox_lease_state;
ALTER TABLE public.crm_sync_outbox VALIDATE CONSTRAINT crm_sync_outbox_success_state;
ALTER TABLE public.crm_sync_outbox VALIDATE CONSTRAINT crm_sync_outbox_phone_state;

REVOKE ALL ON TABLE public.crm_contact_links FROM anon, authenticated;
GRANT SELECT ON TABLE public.crm_contact_links TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_contacts_atomic(
  p_primary_id uuid,
  p_secondary_ids uuid[],
  p_merged_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_secondary_ids uuid[];
  v_expected integer;
  v_locked integer;
  v_relation record;
  v_moved bigint := 0;
  v_affected bigint;
  v_secondary_link public.crm_contact_links%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT id ORDER BY id), count(DISTINCT id)
  INTO v_secondary_ids, v_expected
  FROM unnest(COALESCE(p_secondary_ids, ARRAY[]::uuid[])) AS ids(id)
  WHERE id IS NOT NULL AND id <> p_primary_id;

  IF p_primary_id IS NULL OR v_expected IS NULL OR v_expected < 1 OR v_expected > 50 THEN
    RAISE EXCEPTION 'invalid_contact_merge_set' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_merged_fields, '{}'::jsonb)) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(COALESCE(p_merged_fields, '{}'::jsonb)) AS key
       WHERE key NOT IN ('name','surname','nickname','phone','email','company','job_title','contact_type','avatar_url','tags')
     ) THEN
    RAISE EXCEPTION 'invalid_contact_merge_fields' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.contacts
  WHERE id = p_primary_id OR id = ANY(v_secondary_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> v_expected + 1 THEN
    RAISE EXCEPTION 'contact_merge_target_missing' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = p_primary_id)
     AND EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids)) THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_secondary_link
  FROM public.crm_contact_links
  WHERE zapp_contact_id = ANY(v_secondary_ids)
  ORDER BY zapp_contact_id
  LIMIT 1;
  IF FOUND AND (
    SELECT count(*) FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  IF v_secondary_link.id IS NOT NULL THEN
    UPDATE public.crm_contact_links
    SET zapp_contact_id = p_primary_id, verified_at = now()
    WHERE id = v_secondary_link.id;
  END IF;

  UPDATE public.contacts
  SET
    name = CASE WHEN p_merged_fields ? 'name' THEN NULLIF(p_merged_fields->>'name', '') ELSE name END,
    surname = CASE WHEN p_merged_fields ? 'surname' THEN p_merged_fields->>'surname' ELSE surname END,
    nickname = CASE WHEN p_merged_fields ? 'nickname' THEN p_merged_fields->>'nickname' ELSE nickname END,
    phone = CASE WHEN p_merged_fields ? 'phone' THEN NULLIF(p_merged_fields->>'phone', '') ELSE phone END,
    email = CASE WHEN p_merged_fields ? 'email' THEN p_merged_fields->>'email' ELSE email END,
    company = CASE WHEN p_merged_fields ? 'company' THEN p_merged_fields->>'company' ELSE company END,
    job_title = CASE WHEN p_merged_fields ? 'job_title' THEN p_merged_fields->>'job_title' ELSE job_title END,
    contact_type = CASE WHEN p_merged_fields ? 'contact_type' THEN p_merged_fields->>'contact_type' ELSE contact_type END,
    avatar_url = CASE WHEN p_merged_fields ? 'avatar_url' THEN p_merged_fields->>'avatar_url' ELSE avatar_url END,
    tags = CASE WHEN p_merged_fields ? 'tags' THEN ARRAY(
      SELECT DISTINCT value FROM jsonb_array_elements_text(p_merged_fields->'tags') AS value
    ) ELSE tags END,
    updated_at = now()
  WHERE id = p_primary_id;

  -- Move todas as FKs simples atuais e futuras que apontem para contacts(id).
  -- Unique/conflict em qualquer dependência aborta e reverte a transação inteira.
  FOR v_relation IN
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.contacts'::regclass
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND ns.nspname = 'public'
      AND rel.relname <> 'crm_contact_links'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)',
      v_relation.schema_name, v_relation.table_name,
      v_relation.column_name, v_relation.column_name
    ) USING p_primary_id, v_secondary_ids;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_moved := v_moved + v_affected;
  END LOOP;

  DELETE FROM public.contacts WHERE id = ANY(v_secondary_ids);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_merge_delete_failed' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'primary_id', p_primary_id,
    'merged_contacts', v_expected,
    'moved_relations', v_moved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) IS
  'Mescla contatos atomicamente; conflitos em vínculos ou dependências causam rollback integral.';

CREATE OR REPLACE FUNCTION public.upsert_crm_contact_link_guarded(
  p_zapp_contact_id uuid,
  p_external_contact_id text,
  p_external_company_id text,
  p_normalized_phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing text;
  v_rows integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF length(p_external_contact_id) NOT BETWEEN 1 AND 200
     OR (p_external_company_id IS NOT NULL AND length(p_external_company_id) NOT BETWEEN 1 AND 200)
     OR p_normalized_phone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'invalid_crm_link' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.contacts WHERE id = p_zapp_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT external_contact_id INTO v_existing
  FROM public.crm_contact_links
  WHERE zapp_contact_id = p_zapp_contact_id
  FOR UPDATE;
  IF FOUND AND v_existing <> p_external_contact_id THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.crm_contact_links (
    zapp_contact_id, external_contact_id, external_company_id,
    normalized_phone, link_source, verified_at
  ) VALUES (
    p_zapp_contact_id, p_external_contact_id, p_external_company_id,
    p_normalized_phone, 'sync_result', now()
  )
  ON CONFLICT (zapp_contact_id) DO UPDATE SET
    external_company_id = EXCLUDED.external_company_id,
    normalized_phone = EXCLUDED.normalized_phone,
    verified_at = now()
  WHERE public.crm_contact_links.external_contact_id = EXCLUDED.external_contact_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_crm_contact_link_guarded(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_crm_contact_link_guarded(uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.redact_crm_sync_on_contact_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'dead_letter',
      normalized_phone = NULL,
      payload = jsonb_build_object(
        'redacted', true,
        'reason', 'CONTACT_DELETED',
        'original_sha256', encode(digest(payload::text, 'sha256'), 'hex')
      ),
      locked_at = NULL,
      locked_by = NULL,
      lease_token = NULL,
      last_error_code = 'CONTACT_DELETED',
      external_interaction_id = NULL,
      external_contact_id = NULL,
      external_company_id = NULL,
      updated_at = now()
  WHERE contact_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_redact_crm_sync_on_contact_delete ON public.contacts;
CREATE TRIGGER trg_redact_crm_sync_on_contact_delete
BEFORE DELETE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.redact_crm_sync_on_contact_delete();

REVOKE ALL ON FUNCTION public.redact_crm_sync_on_contact_delete() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_crm_sync_outbox_status_completed
  ON public.crm_sync_outbox(status, completed_at DESC)
  WHERE status IN ('succeeded', 'dead_letter');

CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox(p_worker text, p_limit integer DEFAULT 10)
RETURNS SETOF public.crm_sync_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Reaper limitado: evita uma única transação atualizar todo o backlog vencido.
  WITH exhausted AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE status = 'processing'
      AND locked_at < now() - interval '5 minutes'
      AND attempt_count >= max_attempts
    ORDER BY locked_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  )
  UPDATE public.crm_sync_outbox q
  SET status = 'dead_letter', locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS', updated_at = now()
  FROM exhausted e WHERE q.id = e.id;

  RETURN QUERY
  WITH ready AS (
    SELECT id, created_at FROM public.crm_sync_outbox
    WHERE status IN ('pending', 'failed') AND available_at <= now()
      AND attempt_count < max_attempts AND normalized_phone IS NOT NULL
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  ), stale AS (
    SELECT id, created_at FROM public.crm_sync_outbox
    WHERE status = 'processing' AND locked_at < now() - interval '5 minutes'
      AND attempt_count < max_attempts AND normalized_phone IS NOT NULL
    ORDER BY locked_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  ), candidates AS (
    SELECT id FROM (SELECT * FROM ready UNION ALL SELECT * FROM stale) queued
    ORDER BY created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  )
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100),
      lease_token = gen_random_uuid(), updated_at = now()
  FROM candidates c WHERE q.id = c.id
  RETURNING q.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_crm_sync_outbox(
  p_id uuid, p_lease_token uuid, p_error_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rows integer;
  v_terminal boolean := p_error_code IN ('CRM_CONTACT_DELETED', 'CRM_IDENTITY_MISMATCH');
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = CASE WHEN v_terminal OR attempt_count >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
      available_at = now() + make_interval(secs => LEAST(
        3600, (power(2, GREATEST(0, LEAST(attempt_count, 10) - 1)) * 30)::integer
      )),
      locked_at = NULL, locked_by = NULL, lease_token = NULL,
      last_error_code = left(p_error_code, 100), updated_at = now()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_lease_lost' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_crm_sync_outbox(
  p_succeeded_days integer DEFAULT 90,
  p_dead_letter_days integer DEFAULT 180,
  p_limit integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  WITH expired AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE (status = 'succeeded' AND completed_at < now() - make_interval(days => GREATEST(p_succeeded_days, 30)))
       OR (status = 'dead_letter' AND updated_at < now() - make_interval(days => GREATEST(p_dead_letter_days, 30)))
    ORDER BY COALESCE(completed_at, updated_at)
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.crm_sync_outbox q USING expired e WHERE q.id = e.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_crm_sync_outbox(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_crm_sync_outbox(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_crm_sync_outbox(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crm_sync_outbox(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_crm_sync_outbox(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_crm_sync_outbox(integer, integer, integer) TO service_role;
