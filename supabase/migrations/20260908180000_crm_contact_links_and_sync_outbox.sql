-- CRM externo: vinculo de identidades e entrega confiavel de interacoes.
-- O telefone e apenas descoberta inicial; external_contact_id passa a ser a
-- identidade persistente. Cada closure gera uma chave idempotente exclusiva.

CREATE TABLE public.crm_contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zapp_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  external_contact_id text NOT NULL,
  external_company_id text,
  normalized_phone text CHECK (normalized_phone IS NULL OR normalized_phone ~ '^[0-9]{8,15}$'),
  link_source text NOT NULL DEFAULT 'phone_lookup'
    CHECK (link_source IN ('phone_lookup', 'manual', 'sync_result')),
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (zapp_contact_id),
  UNIQUE (external_contact_id)
);

ALTER TABLE public.crm_contact_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contact_links TO authenticated;
CREATE POLICY "Visible contact CRM links"
  ON public.crm_contact_links FOR SELECT TO authenticated
  USING (public.is_contact_visible_to_user(zapp_contact_id, auth.uid()));
CREATE POLICY "Admins manage CRM links"
  ON public.crm_contact_links FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE INDEX idx_crm_contact_links_phone ON public.crm_contact_links(normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE TABLE public.crm_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid REFERENCES public.conversation_closures(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  normalized_phone text NOT NULL CHECK (normalized_phone ~ '^[0-9]{8,15}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  external_interaction_id text,
  external_contact_id text,
  external_company_id text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closure_id)
);

ALTER TABLE public.crm_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_sync_outbox FROM anon, authenticated;
GRANT SELECT ON public.crm_sync_outbox TO authenticated;
CREATE POLICY "Admins inspect CRM sync outbox"
  ON public.crm_sync_outbox FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
CREATE INDEX idx_crm_sync_outbox_claim
  ON public.crm_sync_outbox(status, available_at, created_at)
  WHERE status IN ('pending', 'failed', 'processing');

CREATE OR REPLACE FUNCTION public.enqueue_crm_sync_from_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_phone text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id = NEW.contact_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_phone := regexp_replace(COALESCE(v_contact.phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) NOT BETWEEN 8 AND 15 THEN RETURN NEW; END IF;

  INSERT INTO public.crm_sync_outbox (
    closure_id, contact_id, idempotency_key, normalized_phone, payload
  ) VALUES (
    NEW.id,
    NEW.contact_id,
    'closure:' || NEW.id::text,
    v_phone,
    jsonb_strip_nulls(jsonb_build_object(
      'channel', COALESCE(v_contact.channel_type, 'whatsapp'),
      'direction', 'inbound',
      'assunto', 'Conversa encerrada - ' || v_contact.name,
      'resumo', COALESCE(NEW.notes, NEW.close_reason),
      'sentiment', COALESCE(v_contact.ai_sentiment, 'neutral'),
      'zapp_conversation_id', NEW.id::text
    ))
  ) ON CONFLICT (closure_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_crm_sync_from_closure() FROM PUBLIC;
CREATE TRIGGER trg_enqueue_crm_sync_from_closure
AFTER INSERT ON public.conversation_closures
FOR EACH ROW EXECUTE FUNCTION public.enqueue_crm_sync_from_closure();

CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox(p_worker text, p_limit integer DEFAULT 20)
RETURNS SETOF public.crm_sync_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH candidates AS (
    SELECT id FROM public.crm_sync_outbox
    WHERE (
        (status IN ('pending', 'failed') AND available_at <= now())
        OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )
      AND (attempt_count < max_attempts OR status = 'processing')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100), updated_at = now()
  FROM candidates c WHERE q.id = c.id
  RETURNING q.*;
$function$;

CREATE OR REPLACE FUNCTION public.complete_crm_sync_outbox(
  p_id uuid, p_interaction_id text, p_contact_id text, p_company_id text
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
      last_error_code = NULL, external_interaction_id = p_interaction_id,
      external_contact_id = p_contact_id, external_company_id = p_company_id, updated_at = now()
  WHERE id = p_id AND status = 'processing';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_not_processing' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_crm_sync_outbox_by_id(p_id uuid, p_worker text)
RETURNS SETOF public.crm_sync_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  UPDATE public.crm_sync_outbox q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      locked_at = now(), locked_by = left(p_worker, 100), updated_at = now()
  WHERE q.id = p_id
    AND (
      (q.status IN ('pending', 'failed') AND q.available_at <= now())
      OR (q.status = 'processing' AND q.locked_at < now() - interval '5 minutes')
    )
    AND (q.attempt_count < q.max_attempts OR q.status = 'processing')
  RETURNING q.*;
$function$;

CREATE OR REPLACE FUNCTION public.fail_crm_sync_outbox(p_id uuid, p_error_code text)
RETURNS void
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
      locked_at = NULL, locked_by = NULL, last_error_code = left(p_error_code, 100), updated_at = now()
  WHERE id = p_id AND status = 'processing';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'crm_sync_outbox_not_processing' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_crm_sync_outbox(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_crm_sync_outbox_by_id(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_crm_sync_outbox(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_crm_sync_outbox(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crm_sync_outbox(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_crm_sync_outbox_by_id(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_crm_sync_outbox(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_crm_sync_outbox(uuid, text) TO service_role;

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
  IF auth.role() <> 'service_role'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
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
      WHERE status = 'succeeded' AND external_contact_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.crm_contact_links l
          WHERE l.zapp_contact_id = crm_sync_outbox.contact_id
            AND l.external_contact_id = crm_sync_outbox.external_contact_id
        )
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
