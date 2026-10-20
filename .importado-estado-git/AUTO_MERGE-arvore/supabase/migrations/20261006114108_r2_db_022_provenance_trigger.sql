-- r2_db_022_provenance_trigger
-- Rollback: DROP TRIGGER IF EXISTS trg_guard_message_provenance_fields ON public.messages; DROP FUNCTION IF EXISTS public.guard_message_provenance_fields();

CREATE OR REPLACE FUNCTION public.guard_message_provenance_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
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
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
      RAISE EXCEPTION 'message_provenance_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_provenance_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_message_provenance_fields ON public.messages;
CREATE TRIGGER trg_guard_message_provenance_fields
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_provenance_fields();
