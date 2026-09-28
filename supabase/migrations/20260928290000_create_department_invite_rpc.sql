-- E14: Criar RPC create_department_invite (faltava na V2)
-- Apenas admins/supervisores podem criar convites

CREATE OR REPLACE FUNCTION public.create_department_invite(
  p_department_id UUID,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'member',
  p_max_uses INTEGER DEFAULT 1,
  p_expires_in_hours INTEGER DEFAULT 72
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_code TEXT;
  v_invite_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar se caller e admin ou supervisor
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller
      AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  -- Validar role
  IF p_role NOT IN ('member', 'moderator', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role');
  END IF;

  -- Validar max_uses
  IF p_max_uses < 1 OR p_max_uses > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_max_uses');
  END IF;

  -- Gerar codigo unico
  v_code := encode(gen_random_bytes(12), 'hex');

  INSERT INTO public.department_invitations (
    department_id,
    code,
    email,
    role,
    status,
    max_uses,
    use_count,
    expires_at,
    created_by
  ) VALUES (
    p_department_id,
    v_code,
    p_email,
    p_role,
    'pending',
    p_max_uses,
    0,
    CASE WHEN p_expires_in_hours > 0
         THEN now() + (p_expires_in_hours || ' hours')::INTERVAL
         ELSE NULL END,
    v_caller
  ) RETURNING id INTO v_invite_id;

  -- Audit log
  INSERT INTO public.department_audit_logs (
    department_id,
    action,
    actor_id,
    details
  ) VALUES (
    p_department_id,
    'invite_created',
    v_caller,
    jsonb_build_object(
      'invite_id', v_invite_id,
      'code', v_code,
      'email', p_email,
      'max_uses', p_max_uses
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'code', v_code,
    'expires_at', CASE WHEN p_expires_in_hours > 0
                       THEN now() + (p_expires_in_hours || ' hours')::INTERVAL
                       ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_department_invite(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_department_invite(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
