-- E34: Indices para busca de texto em team_messages
-- Suporta busca full-text no conteudo das mensagens

-- Index GIN para full-text search em portugues
CREATE INDEX IF NOT EXISTS idx_team_messages_content_fts
  ON public.team_messages
  USING gin(to_tsvector('portuguese', coalesce(content, '')));

-- Index para buscar mensagens por remetente
CREATE INDEX IF NOT EXISTS idx_team_messages_sender
  ON public.team_messages (sender_id, created_at DESC);

-- Index para o realtime: mensagens novas em uma conversa
CREATE INDEX IF NOT EXISTS idx_team_messages_unread
  ON public.team_messages (conversation_id, created_at)
  WHERE status != 'read';
