-- E36: Index de expires_at em department_invitations + NOT NULL em campos obrigatorios

CREATE INDEX IF NOT EXISTS idx_dept_inv_expires_at
  ON public.department_invitations (expires_at)
  WHERE expires_at IS NOT NULL AND status = 'pending';

-- created_by nao pode ser NULL
ALTER TABLE public.department_invitations
  ALTER COLUMN created_by SET NOT NULL;

-- status deve ser valido
ALTER TABLE public.department_invitations
  DROP CONSTRAINT IF EXISTS dept_inv_status_check;

ALTER TABLE public.department_invitations
  ADD CONSTRAINT dept_inv_status_check
  CHECK (status IN ('pending', 'used', 'expired', 'cancelled'));

-- role deve ser valido
ALTER TABLE public.department_invitations
  DROP CONSTRAINT IF EXISTS dept_inv_role_check;

ALTER TABLE public.department_invitations
  ADD CONSTRAINT dept_inv_role_check
  CHECK (role IN ('member', 'moderator', 'admin'));
