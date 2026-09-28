-- E24: CHECK constraint de message_type valido em team_messages

ALTER TABLE public.team_messages
  DROP CONSTRAINT IF EXISTS team_messages_message_type_check;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'reaction', 'system'));

-- CHECK de status valido
ALTER TABLE public.team_messages
  DROP CONSTRAINT IF EXISTS team_messages_status_check;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_status_check
  CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'pending') OR status IS NULL);
