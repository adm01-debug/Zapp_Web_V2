CREATE OR REPLACE FUNCTION public.guard_message_provenance_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_status_default constant text := 'sent';
  c_deleted_content constant text := '[Mensagem apagada]';
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender IS DISTINCT FROM 'agent' THEN
      RAISE EXCEPTION 'message_sender_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.external_id IS NOT NULL THEN
      RAISE EXCEPTION 'message_external_id_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.media_url IS NOT NULL THEN
      RAISE EXCEPTION 'message_media_url_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) status e os carimbos de entrega sao do banco, nao do cliente.
    IF NEW.status IS DISTINCT FROM c_status_default THEN
      RAISE EXCEPTION 'message_status_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'message_created_at_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.status_updated_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'message_status_updated_at_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
      RAISE EXCEPTION 'message_provenance_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) carimbos de entrega: nao se escolhe status nem instante numa
    -- linha existente (era o vetor de forjar o SLA com 'failed' -> 'sent').
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'message_status_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'message_created_at_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'message_status_updated_at_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) o texto do cliente nao se reescreve. Unica excecao: o par
    -- exato do "apagar" usado pelo inbox em qualquer origem, com o caption
    -- intacto.
    IF OLD.sender = 'contact'
       AND (NEW.content IS DISTINCT FROM OLD.content
            OR NEW.caption IS DISTINCT FROM OLD.caption)
       AND NOT (NEW.is_deleted IS TRUE
                AND NEW.content = c_deleted_content
                AND NEW.caption IS NOT DISTINCT FROM OLD.caption) THEN
      RAISE EXCEPTION 'message_contact_content_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
