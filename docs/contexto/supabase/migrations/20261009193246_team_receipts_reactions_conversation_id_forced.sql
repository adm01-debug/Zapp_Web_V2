UPDATE public.team_message_receipts r SET conversation_id = m.conversation_id FROM public.team_messages m WHERE m.id = r.message_id AND r.conversation_id IS DISTINCT FROM m.conversation_id

UPDATE public.team_message_reactions r SET conversation_id = m.conversation_id FROM public.team_messages m WHERE m.id = r.message_id AND r.conversation_id IS DISTINCT FROM m.conversation_id

CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN SELECT tm.conversation_id INTO NEW.conversation_id FROM public.team_messages tm WHERE tm.id = NEW.message_id; IF NEW.conversation_id IS NULL THEN RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id; END IF; RETURN NEW; END; $function$

REVOKE EXECUTE ON FUNCTION public.team_receipts_fill_conversation_id() FROM PUBLIC, anon, authenticated

DROP TRIGGER IF EXISTS team_receipts_fill_conversation_id_trig ON public.team_message_receipts

CREATE TRIGGER team_receipts_fill_conversation_id_trig BEFORE INSERT OR UPDATE ON public.team_message_receipts FOR EACH ROW EXECUTE FUNCTION public.team_receipts_fill_conversation_id()

CREATE OR REPLACE FUNCTION public.team_reactions_force_conversation_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN SELECT tm.conversation_id INTO NEW.conversation_id FROM public.team_messages tm WHERE tm.id = NEW.message_id; IF NEW.conversation_id IS NULL THEN RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id; END IF; RETURN NEW; END; $function$

REVOKE EXECUTE ON FUNCTION public.team_reactions_force_conversation_id() FROM PUBLIC, anon, authenticated

DROP TRIGGER IF EXISTS team_reactions_force_conversation_id_trig ON public.team_message_reactions

CREATE TRIGGER team_reactions_force_conversation_id_trig BEFORE INSERT OR UPDATE ON public.team_message_reactions FOR EACH ROW EXECUTE FUNCTION public.team_reactions_force_conversation_id()
