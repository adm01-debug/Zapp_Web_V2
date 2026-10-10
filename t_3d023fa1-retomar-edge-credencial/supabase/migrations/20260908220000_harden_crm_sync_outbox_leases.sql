-- Hardening forward-only da fila CRM já ativa em produção.
-- Introduz fencing por lease, preserva auditoria após exclusão de contato e
-- impede que locks expirados excedam max_attempts.

ALTER TABLE public.crm_sync_outbox
  ADD COLUMN lease_token uuid;

ALTER TABLE public.crm_sync_outbox
  ALTER COLUMN contact_id DROP NOT NULL,
  ALTER COLUMN normalized_phone DROP NOT NULL;

ALTER TABLE public.crm_sync_outbox
  DROP CONSTRAINT crm_sync_outbox_contact_id_fkey,
  ADD CONSTRAINT crm_sync_outbox_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Um vínculo de identidade não pode desaparecer implicitamente em hard-delete.
-- Merge/delete deve reatribuir ou remover o vínculo de forma explícita.
ALTER TABLE public.crm_contact_links
  DROP CONSTRAINT crm_contact_links_zapp_contact_id_fkey,
  ADD CONSTRAINT crm_contact_links_zapp_contact_id_fkey
    FOREIGN KEY (zapp_contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT;

ALTER TABLE public.crm_sync_outbox
  ADD CONSTRAINT crm_sync_outbox_payload_size
  CHECK (octet_length(payload::text) <= 20000) NOT VALID;

ALTER TABLE public.crm_sync_outbox
  ADD CONSTRAINT crm_sync_outbox_external_ids_bounded
  CHECK (
    (external_interaction_id IS NULL OR length(external_interaction_id) BETWEEN 1 AND 200)
    AND (external_contact_id IS NULL OR length(external_contact_id) BETWEEN 1 AND 200)
    AND (external_company_id IS NULL OR length(external_company_id) BETWEEN 1 AND 200)
  ) NOT VALID,
  ADD CONSTRAINT crm_sync_outbox_lease_state
  CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL AND lease_token IS NOT NULL)
    OR (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL AND lease_token IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT crm_sync_outbox_success_state
  CHECK (
    status <> 'succeeded'
    OR (completed_at IS NOT NULL AND external_interaction_id IS NOT NULL AND external_contact_id IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT crm_sync_outbox_phone_state
  CHECK (normalized_phone IS NOT NULL OR (status = 'dead_letter' AND last_error_code = 'INVALID_PHONE')) NOT VALID;

DROP INDEX IF EXISTS public.idx_crm_sync_outbox_claim;
CREATE INDEX idx_crm_sync_outbox_ready
  ON public.crm_sync_outbox(available_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_crm_sync_outbox_stale
  ON public.crm_sync_outbox(locked_at, created_at)
  WHERE status = 'processing';
CREATE INDEX idx_crm_sync_outbox_contact
  ON public.crm_sync_outbox(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_crm_contact_links_linked_by
  ON public.crm_contact_links(linked_by) WHERE linked_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_crm_sync_from_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_phone text;
  v_phone_valid boolean;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id = NEW.contact_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_phone := regexp_replace(COALESCE(v_contact.phone, ''), '[^0-9]', '', 'g');
  v_phone_valid := length(v_phone) BETWEEN 8 AND 15;

  INSERT INTO public.crm_sync_outbox (
    closure_id, contact_id, idempotency_key, normalized_phone, payload,
    status, last_error_code
  ) VALUES (
    NEW.id,
    NEW.contact_id,
    'closure:' || NEW.id::text,
    CASE WHEN v_phone_valid THEN v_phone ELSE NULL END,
    jsonb_strip_nulls(jsonb_build_object(
      'channel', COALESCE(v_contact.channel_type, 'whatsapp'),
      'direction', 'inbound',
      'assunto', left('Conversa encerrada - ' || v_contact.name, 300),
      'resumo', left(COALESCE(NEW.notes, NEW.close_reason), 2000),
      'sentiment', COALESCE(v_contact.ai_sentiment, 'neutral'),
      'zapp_conversation_id', NEW.id::text
    )),
    CASE WHEN v_phone_valid THEN 'pending' ELSE 'dead_letter' END,
    CASE WHEN v_phone_valid THEN NULL ELSE 'INVALID_PHONE' END
  ) ON CONFLICT (closure_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox(p_worker text, p_limit integer DEFAULT 10)
RETURNS SETOF public.crm_sync_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'dead_letter', locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS', updated_at = now()
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes'
    AND attempt_count >= max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE (
        (status IN ('pending', 'failed') AND available_at <= now())
        OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )
      AND attempt_count < max_attempts
      AND normalized_phone IS NOT NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
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

CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox_by_id(p_id uuid, p_worker text)
RETURNS SETOF public.crm_sync_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'dead_letter', locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS', updated_at = now()
  WHERE id = p_id AND status = 'processing'
    AND locked_at < now() - interval '5 minutes'
    AND attempt_count >= max_attempts;

  RETURN QUERY
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100),
      lease_token = gen_random_uuid(), updated_at = now()
  WHERE q.id = p_id
    AND (
      (q.status IN ('pending', 'failed') AND q.available_at <= now())
      OR (q.status = 'processing' AND q.locked_at < now() - interval '5 minutes')
    )
    AND q.attempt_count < q.max_attempts
    AND q.normalized_phone IS NOT NULL
  RETURNING q.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_crm_sync_outbox(
  p_id uuid, p_lease_token uuid, p_interaction_id text, p_contact_id text, p_company_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = 'succeeded', completed_at = now(), locked_at = NULL, locked_by = NULL,
      lease_token = NULL, last_error_code = NULL, external_interaction_id = p_interaction_id,
      external_contact_id = p_contact_id, external_company_id = p_company_id, updated_at = now()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_lease_lost' USING ERRCODE = 'P0002';
  END IF;
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
BEGIN
  UPDATE public.crm_sync_outbox
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
      available_at = now() + make_interval(secs => LEAST(3600, (power(2, LEAST(attempt_count, 10)) * 30)::integer)),
      locked_at = NULL, locked_by = NULL, lease_token = NULL,
      last_error_code = left(p_error_code, 100), updated_at = now()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_lease_lost' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_crm_sync_outbox(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_crm_sync_outbox(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_crm_sync_outbox(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_crm_sync_outbox(uuid, uuid, text) TO service_role;

DROP FUNCTION public.complete_crm_sync_outbox(uuid, text, text, text);
DROP FUNCTION public.fail_crm_sync_outbox(uuid, text);

CREATE OR REPLACE FUNCTION public.get_crm_sync_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'succeeded_24h', count(*) FILTER (
      WHERE status = 'succeeded' AND completed_at >= now() - interval '24 hours'
    ),
    'succeeded_without_link', count(*) FILTER (
      WHERE status = 'succeeded'
        AND (external_contact_id IS NULL OR contact_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.crm_contact_links l
          WHERE l.zapp_contact_id = crm_sync_outbox.contact_id
            AND l.external_contact_id = crm_sync_outbox.external_contact_id
        ))
    ),
    'oldest_ready_age_seconds', COALESCE(
      floor(extract(epoch FROM now() - min(created_at) FILTER (
        WHERE (status IN ('pending', 'failed') AND available_at <= now())
           OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )))::bigint,
      0
    ),
    'generated_at', now()
  ) INTO v_result
  FROM public.crm_sync_outbox;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_crm_sync_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_crm_sync_health() TO authenticated, service_role;
