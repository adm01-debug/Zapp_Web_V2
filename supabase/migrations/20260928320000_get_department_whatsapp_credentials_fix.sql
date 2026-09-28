-- E17: Fix get_department_whatsapp_credentials para nunca retornar api_key em claro
-- A funcao anterior retornava a api_key completa; agora retorna apenas um indicador
-- A api_key completa so deve ser acessivel via service_role (edge functions)

CREATE OR REPLACE FUNCTION public.get_department_whatsapp_credentials(
  p_department_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_dept RECORD;
  v_is_member BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar se caller e membro do departamento
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversations tc
    JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
    WHERE tc.department_id = p_department_id
      AND tcm.profile_id = v_caller
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    -- Tambem checar se e admin
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    ) INTO v_is_member;
  END IF;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT
    d.whatsapp_mode,
    d.whatsapp_instance_id,
    -- NUNCA retornar api_key em claro para o front
    CASE WHEN d.whatsapp_api_key IS NOT NULL THEN true ELSE false END AS has_api_key
  INTO v_dept
  FROM public.departments d
  WHERE d.id = p_department_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'department_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'whatsapp_mode', v_dept.whatsapp_mode,
    'whatsapp_instance_id', v_dept.whatsapp_instance_id,
    'has_api_key', v_dept.has_api_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(UUID) TO authenticated;
