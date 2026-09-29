-- E27: reply_to_id self-ref check + same-conversation trigger
ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_no_self_reply
    CHECK (reply_to_id IS NULL OR reply_to_id <> id);

CREATE OR REPLACE FUNCTION public.team_messages_validate_reply_to()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$f$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_messages
       WHERE id = NEW.reply_to_id
         AND conversation_id = NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'reply_to_id must belong to same conversation';
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.team_messages_validate_reply_to() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.team_messages_validate_reply_to() TO authenticated;

DROP TRIGGER IF EXISTS team_messages_validate_reply_to_trig ON public.team_messages;
CREATE TRIGGER team_messages_validate_reply_to_trig
  BEFORE INSERT OR UPDATE ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.team_messages_validate_reply_to();
