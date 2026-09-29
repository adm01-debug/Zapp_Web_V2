-- E28: edit guard — sender check + 48h window + auto-set is_edited/updated_at
CREATE OR REPLACE FUNCTION public.team_messages_edit_guard()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$f$
BEGIN
  IF OLD.sender_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'only sender can edit message';
  END IF;
  IF OLD.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'edit window expired (48h)';
  END IF;
  NEW.is_edited  := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.team_messages_edit_guard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.team_messages_edit_guard() TO authenticated;

DROP TRIGGER IF EXISTS team_messages_edit_guard_trig ON public.team_messages;
CREATE TRIGGER team_messages_edit_guard_trig
  BEFORE UPDATE OF content ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.team_messages_edit_guard();
