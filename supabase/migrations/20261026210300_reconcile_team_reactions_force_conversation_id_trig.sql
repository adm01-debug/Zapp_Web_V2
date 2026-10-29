-- Reconcilia drift: função e trigger existem em produção sem migration.
-- A função é chamada pelo trigger BEFORE INSERT OR UPDATE em team_message_reactions
-- para preencher conversation_id a partir da mensagem pai (team_messages).

CREATE OR REPLACE FUNCTION public.team_reactions_force_conversation_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm
   WHERE tm.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_reactions_force_conversation_id_trig ON public.team_message_reactions;
CREATE TRIGGER team_reactions_force_conversation_id_trig
  BEFORE INSERT OR UPDATE ON public.team_message_reactions
  FOR EACH ROW EXECUTE FUNCTION team_reactions_force_conversation_id();
