CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN UPDATE public.team_conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id; RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS after_team_message_insert_bump_conversation ON public.team_messages;

CREATE TRIGGER after_team_message_insert_bump_conversation AFTER INSERT ON public.team_messages FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();
