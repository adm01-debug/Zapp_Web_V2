-- E56: audit log de supressão -- removed_by + removed_at
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS removed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at  timestamptz;

-- Soft-delete: marcar como removido sem apagar (preserva historico de supressão)
-- A funcao de remoção do cliente passa a fazer UPDATE em vez de DELETE
-- DELETE real só ocorre via job de limpeza (E89+)
