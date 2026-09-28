-- E12: Adicionar colunas de auditoria/controle em department_invitations
-- used_at, used_by, max_uses, use_count + CHECKs + indice parcial

ALTER TABLE public.department_invitations
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0;

-- Constraints de integridade
ALTER TABLE public.department_invitations
  ADD CONSTRAINT dept_inv_max_uses_positive CHECK (max_uses > 0),
  ADD CONSTRAINT dept_inv_use_count_non_negative CHECK (use_count >= 0),
  ADD CONSTRAINT dept_inv_use_count_le_max CHECK (use_count <= max_uses),
  ADD CONSTRAINT dept_inv_used_at_requires_used_by CHECK (
    (used_at IS NULL) = (used_by IS NULL) OR max_uses > 1
  );

-- Indice parcial: apenas convites ativos (nao expirados e com usos disponiveis)
CREATE INDEX IF NOT EXISTS idx_dept_inv_active_code
  ON public.department_invitations (code)
  WHERE status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
    AND use_count < max_uses;
