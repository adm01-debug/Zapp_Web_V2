-- E27: FK em team_message_receipts para team_messages
-- Garante que receipts nao existam para mensagens deletadas

ALTER TABLE public.team_message_receipts
  DROP CONSTRAINT IF EXISTS team_message_receipts_message_id_fkey;

ALTER TABLE public.team_message_receipts
  ADD CONSTRAINT team_message_receipts_message_id_fkey
  FOREIGN KEY (message_id)
  REFERENCES public.team_messages(id)
  ON DELETE CASCADE;

-- UNIQUE: um usuario nao pode ter dois receipts para a mesma mensagem
ALTER TABLE public.team_message_receipts
  DROP CONSTRAINT IF EXISTS team_message_receipts_unique_user_message;

ALTER TABLE public.team_message_receipts
  ADD CONSTRAINT team_message_receipts_unique_user_message
  UNIQUE (message_id, profile_id);
