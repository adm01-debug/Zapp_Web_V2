-- CV-014+015: gatilho "cliente falou" → enfileira copilot_tick com debounce 4 s
-- Estende IA-045. Só mensagem de contact, contato válido para vendas, flag ligada.

CREATE OR REPLACE FUNCTION public.enqueue_copilot_tick_on_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_contact        public.contacts%ROWTYPE;
  v_phone          text;
  v_flag_disabled  boolean;
  v_profile_id     uuid;
  v_ikey           text;
BEGIN
  IF NEW.sender <> 'contact' THEN RETURN NEW; END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id = NEW.contact_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_contact.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF coalesce(v_contact.is_lid_legacy, false) THEN RETURN NEW; END IF;
  v_phone := regexp_replace(coalesce(v_contact.phone,''), '[^0-9]', '', 'g');
  IF length(v_phone) NOT BETWEEN 10 AND 15 THEN RETURN NEW; END IF;

  SELECT enabled INTO v_flag_disabled
    FROM public.feature_flags
   WHERE key = 'ai.capability.copilot_live'
   LIMIT 1;
  IF v_flag_disabled = false THEN RETURN NEW; END IF;

  v_profile_id := v_contact.assigned_to;
  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  INSERT INTO public.copilot_sessions
    (contact_id, whatsapp_connection_id, profile_id, last_contact_message_at)
  VALUES
    (NEW.contact_id, NEW.whatsapp_connection_id, v_profile_id, NEW.created_at)
  ON CONFLICT (contact_id, whatsapp_connection_id) DO UPDATE
    SET last_contact_message_at = EXCLUDED.last_contact_message_at,
        updated_at = now();

  v_ikey := 'copilot_tick:'
    || NEW.contact_id::text || ':'
    || NEW.whatsapp_connection_id::text || ':'
    || floor(extract(epoch FROM now()) / 4)::bigint::text;

  INSERT INTO public.ai_jobs
    (idempotency_key, kind, function_name, user_id, payload,
     priority, available_at, max_attempts, status)
  VALUES
    (v_ikey, 'copilot_tick', 'copilot-live', v_profile_id,
     jsonb_build_object(
       'contact_id',             NEW.contact_id,
       'whatsapp_connection_id', NEW.whatsapp_connection_id,
       'trigger_message_id',     NEW.id,
       'profile_id',             v_profile_id
     ),
     200,
     now() + interval '4 seconds',
     3, 'queued')
  ON CONFLICT (idempotency_key) DO UPDATE
    SET available_at = now() + interval '4 seconds',
        payload = EXCLUDED.payload;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_copilot_tick_on_contact_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_copilot_tick_on_contact_message();
