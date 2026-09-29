-- E10: Adiciona conversation_id em team_message_receipts para Realtime eficiente
-- Sem essa coluna o frontend precisava filtrar localmente por message_id (N+1 joins)

ALTER TABLE public.team_message_receipts
  ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES public.team_conversations(id) ON DELETE CASCADE;

-- Backfill registros existentes
UPDATE public.team_message_receipts r
SET conversation_id = m.conversation_id
FROM public.team_messages m
WHERE m.id = r.message_id AND r.conversation_id IS NULL;

-- Índice para filtro Realtime por conversa
CREATE INDEX idx_team_message_receipts_conversation_id
  ON public.team_message_receipts (conversation_id)
  WHERE conversation_id IS NOT NULL;
