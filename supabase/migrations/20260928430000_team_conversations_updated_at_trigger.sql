-- E29: Trigger de updated_at automatico em team_conversations e team_messages

CREATE OR REPLACE FUNCTION public.team_chat_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_chat_set_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS team_conversations_set_updated_at ON public.team_conversations;
CREATE TRIGGER team_conversations_set_updated_at
  BEFORE UPDATE ON public.team_conversations
  FOR EACH ROW EXECUTE FUNCTION public.team_chat_set_updated_at();

DROP TRIGGER IF EXISTS team_messages_set_updated_at ON public.team_messages;
CREATE TRIGGER team_messages_set_updated_at
  BEFORE UPDATE ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.team_chat_set_updated_at();
