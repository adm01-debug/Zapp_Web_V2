-- E16: REVOKE INSERT/UPDATE de colunas whatsapp em departments para authenticated
-- Colunas sensiveis (whatsapp_api_key, whatsapp_instance_id, whatsapp_mode) so
-- devem ser alteradas via RPC set_department_whatsapp_config (SECURITY DEFINER)

REVOKE UPDATE (whatsapp_api_key, whatsapp_instance_id, whatsapp_mode) ON TABLE public.departments FROM authenticated;

-- RPC para configurar whatsapp de departamento (so admins)
CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(
  p_department_id UUID,
  p_whatsapp_mode TEXT,
  p_whatsapp_instance_id TEXT DEFAULT NULL,
  p_whatsapp_api_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller
      AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_whatsapp_mode NOT IN ('shared', 'dedicated', 'disabled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_whatsapp_mode');
  END IF;

  UPDATE public.departments
  SET
    whatsapp_mode = p_whatsapp_mode,
    whatsapp_instance_id = COALESCE(p_whatsapp_instance_id, whatsapp_instance_id),
    whatsapp_api_key = COALESCE(p_whatsapp_api_key, whatsapp_api_key),
    updated_at = now()
  WHERE id = p_department_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'department_not_found');
  END IF;

  INSERT INTO public.department_audit_logs (
    department_id, action, actor_id, details
  ) VALUES (
    p_department_id, 'whatsapp_config_updated', v_caller,
    jsonb_build_object('mode', p_whatsapp_mode, 'instance_id', p_whatsapp_instance_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_department_whatsapp_config(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_department_whatsapp_config(UUID, TEXT, TEXT, TEXT) TO authenticated;
