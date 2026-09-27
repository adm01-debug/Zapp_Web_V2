-- E12: Add CHECK constraints on type/message_type/status enumerations
ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_type_check
  CHECK (type IN ('direct', 'group', 'department'));

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'system'));

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_status_check
  CHECK (status IN ('sent', 'delivered', 'read', 'failed'));
