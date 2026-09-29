-- E51: team_message_receipts.conversation_id NOT NULL + trigger auto-fill

ALTER TABLE public.team_message_receipts
  ALTER COLUMN conversation_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm WHERE tm.id = NEW.message_id;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS team_receipts_fill_conversation_id_trig ON public.team_message_receipts;
CREATE TRIGGER team_receipts_fill_conversation_id_trig
  BEFORE INSERT ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_fill_conversation_id();
