-- E35: Index composto para calculo de unread count por usuario
-- Otimiza a query: mensagens com created_at > last_read_at do membro

CREATE INDEX IF NOT EXISTS idx_tcm_last_read_at
  ON public.team_conversation_members (profile_id, conversation_id, last_read_at);

-- Index para membros ativos (nao arquivados) de um usuario
CREATE INDEX IF NOT EXISTS idx_tcm_profile_active
  ON public.team_conversation_members (profile_id, is_archived, is_muted)
  WHERE is_archived = false;
