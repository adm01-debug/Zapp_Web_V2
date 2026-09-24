CREATE OR REPLACE FUNCTION public.prevent_contact_queue_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.queue_id IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
     AND NOT EXISTS (
       SELECT 1
       FROM queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = get_profile_id_for_user(auth.uid())
         AND qm.is_active = true
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_contact_queue_hijack ON public.contacts;

CREATE TRIGGER trg_prevent_contact_queue_hijack
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  WHEN (NEW.queue_id IS DISTINCT FROM OLD.queue_id)
  EXECUTE FUNCTION public.prevent_contact_queue_hijack();
