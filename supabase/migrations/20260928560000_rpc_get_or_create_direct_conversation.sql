-- E42: RPC get_or_create_direct_conversation - obtem ou cria conversa direta entre dois usuarios

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_other_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_conv_id UUID;
  v_created BOOLEAN := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_other_user_id = v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_create_direct_with_self');
  END IF;

  -- Buscar conversa direta existente (normalized: menor UUID primeiro)
  SELECT id INTO v_conv_id
  FROM public.team_conversations
  WHERE type = 'direct'
    AND LEAST(direct_member_a::text, direct_member_b::text) = LEAST(v_caller::text, p_other_user_id::text)
    AND GREATEST(direct_member_a::text, direct_member_b::text) = GREATEST(v_caller::text, p_other_user_id::text)
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    -- Criar nova conversa direta
    INSERT INTO public.team_conversations (
      type,
      name,
      created_by,
      direct_member_a,
      direct_member_b,
      metadata
    ) VALUES (
      'direct',
      NULL, -- conversas diretas nao tem nome proprio
      v_caller,
      LEAST(v_caller::text, p_other_user_id::text)::UUID,
      GREATEST(v_caller::text, p_other_user_id::text)::UUID,
      '{}'
    ) RETURNING id INTO v_conv_id;

    -- Adicionar ambos como membros
    INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
    VALUES
      (v_conv_id, v_caller, 'member'),
      (v_conv_id, p_other_user_id, 'member');

    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversation_id', v_conv_id,
    'created', v_created
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated;
