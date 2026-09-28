-- E23: FK com ON DELETE CASCADE em team_messages e team_message_reactions
-- Garante que mensagens orfas nao existam apos delecao de conversa

-- team_messages.conversation_id deve ser FK para team_conversations.id
ALTER TABLE public.team_messages
  DROP CONSTRAINT IF EXISTS team_messages_conversation_id_fkey;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES public.team_conversations(id)
  ON DELETE CASCADE;

-- team_messages.reply_to_id FK (sem cascade - SET NULL ao deletar)
ALTER TABLE public.team_messages
  DROP CONSTRAINT IF EXISTS team_messages_reply_to_id_fkey;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_reply_to_id_fkey
  FOREIGN KEY (reply_to_id)
  REFERENCES public.team_messages(id)
  ON DELETE SET NULL;

-- team_message_reactions FK
ALTER TABLE public.team_message_reactions
  DROP CONSTRAINT IF EXISTS team_message_reactions_conversation_id_fkey;

ALTER TABLE public.team_message_reactions
  ADD CONSTRAINT team_message_reactions_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES public.team_conversations(id)
  ON DELETE CASCADE;

ALTER TABLE public.team_message_reactions
  DROP CONSTRAINT IF EXISTS team_message_reactions_message_id_fkey;

ALTER TABLE public.team_message_reactions
  ADD CONSTRAINT team_message_reactions_message_id_fkey
  FOREIGN KEY (message_id)
  REFERENCES public.team_messages(id)
  ON DELETE CASCADE;
