-- Fluxo inbound do webhook (Evolution GO -> evolution-webhook -> handleIncomingMessage)
-- fazia 3-5 round-trips sem transacao: lookup do contato (com relink de conexao),
-- INSERT do contato (com fallback 23505), pre-check de duplicata e UPSERT da
-- mensagem. Falha no meio deixava contato sem mensagem ou relink parcial.
-- Esta RPC executa o find-or-create do contato e o upsert idempotente da mensagem
-- numa unica transacao, com a mesma semantica do codigo TypeScript (variantes do
-- 9o digito, relink para a conexao atual, preservacao de status/conteudo de
-- mensagem apagada, DO NOTHING no indice ux_messages_dedup).
-- Avatar (chamada externa a Evolution) continua fora da transacao, no edge.
CREATE OR REPLACE FUNCTION public.phone_variants(p_phone text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_variants text[];
  v_ddd text;
  v_rest text;
BEGIN
  v_variants := ARRAY[v_clean, '+' || v_clean, p_phone];
  IF v_clean LIKE '55%' AND length(v_clean) >= 12 THEN
    v_ddd := substr(v_clean, 3, 2);
    v_rest := substr(v_clean, 5);
    IF length(v_clean) = 13 AND v_rest LIKE '9%' THEN
      v_variants := v_variants || ('55' || v_ddd || substr(v_rest, 2));
    END IF;
    IF length(v_clean) = 12 THEN
      v_variants := v_variants || ('55' || v_ddd || '9' || v_rest);
    END IF;
  END IF;
  RETURN v_variants;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.phone_variants(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.phone_variants(text) TO service_role;

CREATE OR REPLACE FUNCTION public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz)
 RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variants text[] := public.phone_variants(p_phone);
  v_contact record;
  v_created boolean := false;
  v_existing record;
  v_message_id uuid;
  v_outcome text;
  v_status text;
  v_content text;
BEGIN
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
        created_at = p_created_at, status = v_status
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

  RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) IS 'Transacao atomica do inbound do webhook: find-or-create de contato (variantes do 9o digito, relink de conexao) + upsert idempotente da mensagem (ux_messages_dedup). outcome = inserted | updated | duplicate. Chamada apenas por service_role (edge evolution-webhook).';
