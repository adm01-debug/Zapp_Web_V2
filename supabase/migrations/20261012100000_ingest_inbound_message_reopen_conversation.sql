-- ingest_inbound_message_reopen_conversation
-- Rollback: recriar a funcao com a definicao anterior de 20260905070000 (SQL executavel no bloco comentado abaixo) + REVOKE/GRANT originais de 20260905050000.
-- CREATE OR REPLACE FUNCTION public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz)
--  RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)
--  LANGUAGE plpgsql
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_variants text[] := public.phone_variants(p_phone);
--   v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
--   v_canonical text;
--   v_contact record;
--   v_created boolean := false;
--   v_existing record;
--   v_message_id uuid;
--   v_outcome text;
--   v_status text;
--   v_content text;
-- BEGIN
--   -- Forma canonica: BR com 13 digitos e 9o digito vira a forma de 12; o resto fica como esta.
--   v_canonical := CASE
--     WHEN v_clean LIKE '55%' AND length(v_clean) = 13 AND substr(v_clean, 5, 1) = '9'
--       THEN substr(v_clean, 1, 4) || substr(v_clean, 6)
--     ELSE v_clean
--   END;
--   PERFORM pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical));
--
--   SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
--   FROM public.contacts c
--   WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id
--   ORDER BY c.created_at
--   LIMIT 1;
--
--   IF v_contact.id IS NULL THEN
--     SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
--     FROM public.contacts c
--     WHERE c.phone = ANY(v_variants)
--     ORDER BY c.created_at
--     LIMIT 1;
--
--     IF v_contact.id IS NOT NULL THEN
--       UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
--     ELSE
--       INSERT INTO public.contacts (phone, name, whatsapp_connection_id)
--       VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id)
--       ON CONFLICT (phone) DO NOTHING
--       RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact;
--
--       IF v_contact.id IS NULL THEN
--         SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
--         FROM public.contacts c
--         WHERE c.phone = ANY(v_variants)
--         ORDER BY c.created_at
--         LIMIT 1;
--         IF v_contact.id IS NULL THEN
--           RAISE EXCEPTION 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone USING ERRCODE = 'P0002';
--         END IF;
--         UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
--       ELSE
--         v_created := true;
--       END IF;
--     END IF;
--   END IF;
--
--   SELECT m.id, m.status, m.content INTO v_existing
--   FROM public.messages m
--   WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
--   ORDER BY m.created_at DESC
--   LIMIT 1;
--
--   IF v_existing.id IS NOT NULL THEN
--     v_status := CASE WHEN v_existing.status IS NOT NULL AND v_existing.status <> 'received' THEN v_existing.status ELSE 'received' END;
--     v_content := CASE WHEN v_existing.status = 'deleted' THEN coalesce(v_existing.content, '[Mensagem apagada]') ELSE p_content END;
--     UPDATE public.messages
--     SET contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content,
--         message_type = p_message_type, media_url = p_media_url, sender = 'contact',
--         status = v_status
--     WHERE id = v_existing.id;
--     v_message_id := v_existing.id;
--     v_outcome := 'updated';
--   ELSE
--     INSERT INTO public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at)
--     VALUES (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at)
--     ON CONFLICT (whatsapp_connection_id, external_id, sender) DO NOTHING
--     RETURNING id INTO v_message_id;
--     v_outcome := CASE WHEN v_message_id IS NULL THEN 'duplicate' ELSE 'inserted' END;
--   END IF;
--
--   RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
-- END;
-- $function$;
-- REVOKE EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) TO service_role;
-- ADR-005 / SL-079: ingest_inbound_message nao reabria conversa resolved|archived quando
-- chegava mensagem nova do contato; a conversa ficava fora da aba Abertas ate alguem
-- reabrir na mao. E o unico ponto de entrada inbound (webhooks Evolution e WhatsApp
-- Cloud: evolution-webhook-messages.ts:460 e whatsapp-webhook/index.ts:231), entao a
-- regra fica aqui. A flag inbox.status-fsm nao condiciona: a UI le conversation_status
-- como fonte unica e a flag nunca foi semeada.
-- So o outcome inserted reabre: redelivery (updated) e duplicata (duplicate) nao sao
-- mensagem nova. Transicoes resolved->open e archived->open sao validas pela FSM de
-- set_conversation_status (20260905080000).
-- Nota de rollback: conversas ja reabertas permanecem open apos o rollback (estado
-- valido pela FSM).
CREATE OR REPLACE FUNCTION public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz)
 RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variants text[] := public.phone_variants(p_phone);
  v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_canonical text;
  v_contact record;
  v_created boolean := false;
  v_existing record;
  v_message_id uuid;
  v_outcome text;
  v_status text;
  v_content text;
BEGIN
  -- Forma canonica: BR com 13 digitos e 9o digito vira a forma de 12; o resto fica como esta.
  v_canonical := CASE
    WHEN v_clean LIKE '55%' AND length(v_clean) = 13 AND substr(v_clean, 5, 1) = '9'
      THEN substr(v_clean, 1, 4) || substr(v_clean, 6)
    ELSE v_clean
  END;
  PERFORM pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical));

  SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
  FROM public.contacts c
  WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id
  ORDER BY c.created_at
  LIMIT 1;

  IF v_contact.id IS NULL THEN
    SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
    FROM public.contacts c
    WHERE c.phone = ANY(v_variants)
    ORDER BY c.created_at
    LIMIT 1;

    IF v_contact.id IS NOT NULL THEN
      UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
    ELSE
      INSERT INTO public.contacts (phone, name, whatsapp_connection_id)
      VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id)
      ON CONFLICT (phone) DO NOTHING
      RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact;

      IF v_contact.id IS NULL THEN
        SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
        FROM public.contacts c
        WHERE c.phone = ANY(v_variants)
        ORDER BY c.created_at
        LIMIT 1;
        IF v_contact.id IS NULL THEN
          RAISE EXCEPTION 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone USING ERRCODE = 'P0002';
        END IF;
        UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
      ELSE
        v_created := true;
      END IF;
    END IF;
  END IF;

  SELECT m.id, m.status, m.content INTO v_existing
  FROM public.messages m
  WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_status := CASE WHEN v_existing.status IS NOT NULL AND v_existing.status <> 'received' THEN v_existing.status ELSE 'received' END;
    v_content := CASE WHEN v_existing.status = 'deleted' THEN coalesce(v_existing.content, '[Mensagem apagada]') ELSE p_content END;
    UPDATE public.messages
    SET contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content,
        message_type = p_message_type, media_url = p_media_url, sender = 'contact',
        status = v_status
    WHERE id = v_existing.id;
    v_message_id := v_existing.id;
    v_outcome := 'updated';
  ELSE
    INSERT INTO public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at)
    VALUES (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at)
    ON CONFLICT (whatsapp_connection_id, external_id, sender) DO NOTHING
    RETURNING id INTO v_message_id;
    v_outcome := CASE WHEN v_message_id IS NULL THEN 'duplicate' ELSE 'inserted' END;
  END IF;

  -- ADR-005: mensagem nova do contato reabre conversa resolved|archived.
  IF v_outcome = 'inserted' THEN
    UPDATE public.contacts
    SET conversation_status = 'open', conversation_status_changed_at = now()
    WHERE id = v_contact.id AND conversation_status IN ('resolved', 'archived');
  END IF;

  RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
END;
$function$;
