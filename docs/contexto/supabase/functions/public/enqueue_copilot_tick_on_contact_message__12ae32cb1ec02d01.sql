CREATE OR REPLACE FUNCTION public.enqueue_copilot_tick_on_contact_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contact  record;
  v_user_id  uuid;
  v_session  uuid;
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.feature_flags
       WHERE key = 'ai.capability.copilot_live' AND enabled = false
    ) THEN
      RETURN NEW;
    END IF;

    SELECT c.id, c.assigned_to, c.deleted_at, c.is_lid_legacy, c.contact_type
      INTO v_contact
      FROM public.contacts c
     WHERE c.id = NEW.contact_id;
    IF NOT FOUND
       OR v_contact.deleted_at IS NOT NULL
       OR coalesce(v_contact.is_lid_legacy, false)
       -- copiloto de VENDAS: só cliente (colaborador, fornecedor, transportadora… ficam fora)
       OR coalesce(v_contact.contact_type, 'cliente') <> 'cliente'
       OR v_contact.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;

    -- contacts.assigned_to guarda profiles.id; as tabelas do copiloto usam auth.users.id.
    SELECT p.user_id INTO v_user_id FROM public.profiles p WHERE p.id = v_contact.assigned_to;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.copilot_sessions (conversation_id, contact_id, profile_id, last_contact_message_at)
    VALUES (NEW.contact_id, NEW.contact_id, v_user_id, NEW.created_at)
    ON CONFLICT (conversation_id) DO UPDATE
      SET last_contact_message_at = GREATEST(
            coalesce(public.copilot_sessions.last_contact_message_at, EXCLUDED.last_contact_message_at),
            EXCLUDED.last_contact_message_at),
          profile_id = EXCLUDED.profile_id
    RETURNING id INTO v_session;

    INSERT INTO public.ai_jobs (idempotency_key, kind, function_name, user_id, payload, priority, available_at, max_attempts)
    VALUES (
      'copilot.tick:' || NEW.contact_id::text || ':' || floor(extract(epoch FROM now()) / 4)::bigint::text,
      'copilot.tick',
      'copilot-live',
      v_user_id,
      jsonb_build_object(
        'session_id', v_session,
        'contact_id', NEW.contact_id,
        'profile_id', v_user_id,
        'trigger_message_id', NEW.id
      ),
      50,
      now() + interval '4 seconds',
      3
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'copilot tick nao agendado para a mensagem %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$
