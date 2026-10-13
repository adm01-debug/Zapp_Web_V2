-- contato_excluido_inbox_ingest
-- Rollback: CREATE OR REPLACE FUNCTION public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz) RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text) LANGUAGE plpgsql SET search_path TO 'public' AS $function$ DECLARE v_variants text[] := public.phone_variants(p_phone); v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_canonical text; v_contact record; v_created boolean := false; v_existing record; v_message_id uuid; v_outcome text; v_status text; v_content text; BEGIN v_canonical := CASE WHEN v_clean LIKE '55%' AND length(v_clean) = 13 AND substr(v_clean, 5, 1) = '9' THEN substr(v_clean, 1, 4) || substr(v_clean, 6) ELSE v_clean END; PERFORM pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical)); SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NULL THEN SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NOT NULL THEN UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id; ELSE INSERT INTO public.contacts (phone, name, whatsapp_connection_id) VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id) ON CONFLICT (phone) DO NOTHING RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact; IF v_contact.id IS NULL THEN SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NULL THEN RAISE EXCEPTION 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone USING ERRCODE = 'P0002'; END IF; UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id; ELSE v_created := true; END IF; END IF; END IF; SELECT m.id, m.status, m.content INTO v_existing FROM public.messages m WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id ORDER BY m.created_at DESC LIMIT 1; IF v_existing.id IS NOT NULL THEN v_status := CASE WHEN v_existing.status IS NOT NULL AND v_existing.status <> 'received' THEN v_existing.status ELSE 'received' END; v_content := CASE WHEN v_existing.status = 'deleted' THEN coalesce(v_existing.content, '[Mensagem apagada]') ELSE p_content END; UPDATE public.messages SET contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content, message_type = p_message_type, media_url = p_media_url, sender = 'contact', status = v_status WHERE id = v_existing.id; v_message_id := v_existing.id; v_outcome := 'updated'; ELSE INSERT INTO public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at) VALUES (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at) ON CONFLICT (whatsapp_connection_id, external_id, sender) DO NOTHING RETURNING id INTO v_message_id; v_outcome := CASE WHEN v_message_id IS NULL THEN 'duplicate' ELSE 'inserted' END; END IF; RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome; END; $function$; drop policy if exists "contacts_select_policy" on public.contacts; create policy "contacts_select_policy" on public.contacts for select to authenticated using (public.can_edit_contact(assigned_to, queue_id, (select array_agg(v) from public.get_visible_agent_ids(auth.uid()) v), (select public.get_profile_id_for_user(auth.uid())), (select public.is_admin_or_supervisor(auth.uid()))));
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamptz) RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text) LANGUAGE plpgsql SET search_path TO 'public' AS $function$ DECLARE v_variants text[] := public.phone_variants(p_phone); v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_canonical text; v_contact record; v_created boolean := false; v_existing record; v_message_id uuid; v_outcome text; v_status text; v_content text; BEGIN v_canonical := CASE WHEN v_clean LIKE '55%' AND length(v_clean) = 13 AND substr(v_clean, 5, 1) = '9' THEN substr(v_clean, 1, 4) || substr(v_clean, 6) ELSE v_clean END; PERFORM pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical)); SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NULL THEN SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NOT NULL THEN UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id; ELSE INSERT INTO public.contacts (phone, name, whatsapp_connection_id) VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id) ON CONFLICT (phone) DO NOTHING RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact; IF v_contact.id IS NULL THEN SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact FROM public.contacts c WHERE c.phone = ANY(v_variants) ORDER BY c.created_at LIMIT 1; IF v_contact.id IS NULL THEN RAISE EXCEPTION 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone USING ERRCODE = 'P0002'; END IF; UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id; ELSE v_created := true; END IF; END IF; END IF; SELECT m.id, m.status, m.content INTO v_existing FROM public.messages m WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id ORDER BY m.created_at DESC LIMIT 1; IF v_existing.id IS NOT NULL THEN v_status := CASE WHEN v_existing.status IS NOT NULL AND v_existing.status <> 'received' THEN v_existing.status ELSE 'received' END; v_content := CASE WHEN v_existing.status = 'deleted' THEN coalesce(v_existing.content, '[Mensagem apagada]') ELSE p_content END; UPDATE public.messages SET contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content, message_type = p_message_type, media_url = p_media_url, sender = 'contact', status = v_status WHERE id = v_existing.id; v_message_id := v_existing.id; v_outcome := 'updated'; ELSE INSERT INTO public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at) VALUES (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at) ON CONFLICT (whatsapp_connection_id, external_id, sender) DO NOTHING RETURNING id INTO v_message_id; v_outcome := CASE WHEN v_message_id IS NULL THEN 'duplicate' ELSE 'inserted' END; END IF; RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome; END; $function$;
--   drop policy if exists "contacts_select_policy" on public.contacts;
--   create policy "contacts_select_policy" on public.contacts for select to authenticated using (public.can_edit_contact(assigned_to, queue_id, (select array_agg(v) from public.get_visible_agent_ids(auth.uid()) v), (select public.get_profile_id_for_user(auth.uid())), (select public.is_admin_or_supervisor(auth.uid()))));
--
-- Cartao: contato excluido nao volta pela Inbox. Dois defeitos do modulo de contatos.
--
-- 1) ingest_inbound_message (RPC do webhook inbound) associava a mensagem nova ao
--    registro soft-deleted: o SELECT por phone/conexao nao filtrava deleted_at e o
--    find-or-create nunca desfazia o marcador. O contato continuava invisivel na Inbox
--    (search_contacts/contacts_count_by_type ja filtram deleted_at) e as mensagens
--    ficavam presas num registro oculto. Agora, quando o contato localizado esta
--    excluido, a mensagem nova o REATIVA (deleted_at = NULL) e a Inbox volta a mostrar
--    a conversa. A reativacao e registrada na trilha public.contact_deletion_audit
--    (operation = 'restore') pelo trigger trg_audit_contact_deletion_change, que NAO e
--    alterado aqui. Os lookups tambem passam a preferir o registro VIVO quando dois
--    telefones variantes (com/sem 9o digito) do mesmo numero coexistem, para nao
--    reativar um duplicado antigo em vez de usar o contato ativo.
--
-- 2) contacts_select_policy deixava QUALQUER usuario que pode editar o contato (dono,
--    agente visivel, membro ativo da fila) LER a linha soft-deleted, mesmo excluida.
--    A Inbox (src/services/realtime.service.ts) le public.contacts direto sob RLS, entao
--    a linha excluida reaparecia. A policy passa a exigir deleted_at IS NULL, EXCETO para
--    admin/supervisor, que continuam vendo os excluidos (lixeira / tela de restaurar).
--    O UPDATE (restaurar) nao muda: a policy de UPDATE nao filtra deleted_at e o purge
--    fisico (job/service_role, BYPASSRLS) nao passa por policy.
--
-- Nao muda RETURNS, assinatura, LANGUAGE nem search_path da RPC: o front
-- (src/integrations/supabase/types.ts) segue valido.
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

  SELECT c.id, c.name, c.assigned_to, c.avatar_url, c.deleted_at INTO v_contact
  FROM public.contacts c
  WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id
  ORDER BY (c.deleted_at IS NOT NULL), c.created_at
  LIMIT 1;

  IF v_contact.id IS NULL THEN
    SELECT c.id, c.name, c.assigned_to, c.avatar_url, c.deleted_at INTO v_contact
    FROM public.contacts c
    WHERE c.phone = ANY(v_variants)
    ORDER BY (c.deleted_at IS NOT NULL), c.created_at
    LIMIT 1;

    IF v_contact.id IS NOT NULL THEN
      UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
    ELSE
      INSERT INTO public.contacts (phone, name, whatsapp_connection_id)
      VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id)
      ON CONFLICT (phone) DO NOTHING
      RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact;

      IF v_contact.id IS NULL THEN
        SELECT c.id, c.name, c.assigned_to, c.avatar_url, c.deleted_at INTO v_contact
        FROM public.contacts c
        WHERE c.phone = ANY(v_variants)
        ORDER BY (c.deleted_at IS NOT NULL), c.created_at
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

  -- Reativacao: mensagem nova de contato excluido devolve o contato a Inbox.
  -- O trigger trg_audit_contact_deletion_change registra operation = 'restore' na trilha
  -- (performed_by = auth.uid() quando ha sessao; performed_by_db_role = session_user).
  IF v_contact.deleted_at IS NOT NULL THEN
    UPDATE public.contacts SET deleted_at = NULL WHERE id = v_contact.id;
    v_contact.deleted_at := NULL;
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

  RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
END;
$function$;

DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT
  TO authenticated
  USING (
    (deleted_at IS NULL OR public.is_admin_or_supervisor(auth.uid()))
    AND public.can_edit_contact(assigned_to, queue_id,
          (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
          (SELECT public.get_profile_id_for_user(auth.uid())),
          (SELECT public.is_admin_or_supervisor(auth.uid())))
  );
