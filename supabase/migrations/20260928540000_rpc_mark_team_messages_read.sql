-- E40: RPC mark_team_messages_read - marca mensagens como lidas e atualiza last_read_at

CREATE OR REPLACE FUNCTION public.mark_team_messages_read(
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar membership
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id AND profile_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- Atualizar last_read_at do membro
  UPDATE public.team_conversation_members
  SET last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND profile_id = v_caller;

  -- Upsert de receipts para mensagens nao lidas
  INSERT INTO public.team_message_receipts (message_id, profile_id, status, read_at)
  SELECT tm.id, v_caller, 'read', now()
  FROM public.team_messages tm
  WHERE tm.conversation_id = p_conversation_id
    AND tm.sender_id != v_caller
  ON CONFLICT (message_id, profile_id) DO UPDATE
  SET status = 'read', read_at = COALESCE(team_message_receipts.read_at, now());

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'receipts_updated', v_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_team_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_messages_read(UUID) TO authenticated;
