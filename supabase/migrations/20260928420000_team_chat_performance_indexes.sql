-- E28: Indices de performance para queries criticas do Team Chat

-- Index para buscar mensagens de uma conversa ordenadas por data
CREATE INDEX IF NOT EXISTS idx_team_messages_conversation_created
  ON public.team_messages (conversation_id, created_at DESC);

-- Index para buscar membros de uma conversa
CREATE INDEX IF NOT EXISTS idx_team_conversation_members_conversation
  ON public.team_conversation_members (conversation_id);

-- Index para buscar conversas de um usuario
CREATE INDEX IF NOT EXISTS idx_team_conversation_members_profile
  ON public.team_conversation_members (profile_id);

-- Index para contar mensagens nao lidas (last_read_at vs message created_at)
CREATE INDEX IF NOT EXISTS idx_team_messages_conversation_created_asc
  ON public.team_messages (conversation_id, created_at ASC)
  WHERE created_at IS NOT NULL;

-- Index para reactions por mensagem
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_message
  ON public.team_message_reactions (message_id);

-- Index para receipts por mensagem
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_message
  ON public.team_message_receipts (message_id);

-- Index para receipts por usuario
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_profile
  ON public.team_message_receipts (profile_id, status);
