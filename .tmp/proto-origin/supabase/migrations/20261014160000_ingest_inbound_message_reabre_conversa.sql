-- ingest_inbound_message_reabre_conversa
-- Rollback: recria public.ingest_inbound_message com o corpo ANTERIOR completo (abaixo) e reemite o REVOKE/GRANT da assinatura. Nenhuma tabela/coluna/dado muda aqui, então o corpo da função é o único estado a desfazer.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz) returns table(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text) language plpgsql set search_path to 'public' as $function$ declare v_variants text[] := public.phone_variants(p_phone); v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_canonical text; v_contact record; v_created boolean := false; v_existing record; v_message_id uuid; v_outcome text; v_status text; v_content text; begin v_canonical := case when v_clean like '55%' and length(v_clean) = 13 and substr(v_clean, 5, 1) = '9' then substr(v_clean, 1, 4) || substr(v_clean, 6) else v_clean end; perform pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical)); select c.id, c.name, c.assigned_to, c.avatar_url into v_contact from public.contacts c where c.phone = any(v_variants) and c.whatsapp_connection_id = p_connection_id order by c.created_at limit 1; if v_contact.id is null then select c.id, c.name, c.assigned_to, c.avatar_url into v_contact from public.contacts c where c.phone = any(v_variants) order by c.created_at limit 1; if v_contact.id is not null then update public.contacts set whatsapp_connection_id = p_connection_id, updated_at = now() where id = v_contact.id; else insert into public.contacts (phone, name, whatsapp_connection_id) values (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id) on conflict (phone) do nothing returning contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url into v_contact; if v_contact.id is null then select c.id, c.name, c.assigned_to, c.avatar_url into v_contact from public.contacts c where c.phone = any(v_variants) order by c.created_at limit 1; if v_contact.id is null then raise exception 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone using errcode = 'P0002'; end if; update public.contacts set whatsapp_connection_id = p_connection_id, updated_at = now() where id = v_contact.id; else v_created := true; end if; end if; end if; select m.id, m.status, m.content into v_existing from public.messages m where m.whatsapp_connection_id = p_connection_id and m.sender = 'contact' and m.external_id = p_external_id order by m.created_at desc limit 1; if v_existing.id is not null then v_status := case when v_existing.status is not null and v_existing.status <> 'received' then v_existing.status else 'received' end; v_content := case when v_existing.status = 'deleted' then coalesce(v_existing.content, '[Mensagem apagada]') else p_content end; update public.messages set contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content, message_type = p_message_type, media_url = p_media_url, sender = 'contact', status = v_status where id = v_existing.id; v_message_id := v_existing.id; v_outcome := 'updated'; else insert into public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at) values (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at) on conflict (whatsapp_connection_id, external_id, sender) do nothing returning id into v_message_id; v_outcome := case when v_message_id is null then 'duplicate' else 'inserted' end; end if; return query select v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome; end; $function$;
--   revoke execute on function public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
--   grant execute on function public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) to service_role;
--
-- ADR-005 §3: mensagem inbound do contato reabre a conversa (resolved|archived -> open).
-- O corpo vigente de public.ingest_inbound_message (migration 20260905070000) nao tocava
-- contacts.conversation_status: em resolved e em archived a mensagem entrava mas o status
-- continuava fechado, e a conversa sumia da fila. Esta migration adiciona AO FINAL do corpo
-- vigente, preservado integralmente, um bloco que:
--  - age SO na insercao real da mensagem (v_outcome = 'inserted'); redelivery fica em
--  'updated' e repeticao do mesmo external_id em 'duplicate', e nenhum dos dois reabre;
--  - so com a flag public.feature_flags 'inbox.status-fsm' habilitada (enabled = true);
--  - faz UPDATE de resolved|archived -> open; conversa ja 'open' nao entra no WHERE, entao
--  conversation_status_changed_at fica intacto;
--  - respeita o gatilho public.enforce_conversation_status_transition (resolved->open e
--  archived->open sao transicoes validas);
--  - NAO mexe em assigned_to: a conversa reaberta volta para o mesmo responsavel.
-- A assinatura, o retorno (outcome) e o SET search_path = public sao os MESMOS; o REVOKE e o
-- GRANT da assinatura sao reemitidos no fim para nao depender da ACL herdada.

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

  -- ADR-005 §3: inbound do contato reabre conversa encerrada/arquivada. So quando a mensagem
  -- entrou de verdade (v_outcome = 'inserted'); redelivery ('updated') e duplicata ('duplicate')
  -- nao reabrem. So com a flag inbox.status-fsm ligada. resolved->open e archived->open sao
  -- validas no gatilho FSM. Nao toca assigned_to.
  IF v_outcome = 'inserted'
     AND EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'inbox.status-fsm' AND enabled) THEN
    UPDATE public.contacts
       SET conversation_status = 'open',
           conversation_status_changed_at = now()
     WHERE id = v_contact.id
       AND conversation_status IN ('resolved', 'archived');
  END IF;

  RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) TO service_role;
