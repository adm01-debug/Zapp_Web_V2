-- E13: Reescrever accept_department_invite com FOR UPDATE, deduplicacao e auditoria
-- Versao anterior nao usava FOR UPDATE (race condition), nao deduplicava, nao auditava

CREATE OR REPLACE FUNCTION public.accept_department_invite(
  p_code TEXT,
  p_department_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_caller UUID := auth.uid();
  v_existing BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Lock do convite para prevenir race condition
  SELECT * INTO v_invite
  FROM public.department_invitations
  WHERE code = p_code
    AND department_id = p_department_id
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
    AND use_count < max_uses
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found_or_expired');
  END IF;

  -- Deduplicacao: usuario ja e membro?
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.team_conversations tc ON tc.id = tcm.conversation_id
    WHERE tc.department_id = p_department_id
      AND tcm.profile_id = v_caller
  ) INTO v_existing;

  -- Tambem checar se ja existe membro do departamento direto
  -- (via tabela de membros de departamento se existir)

  -- Incrementar use_count
  UPDATE public.department_invitations
  SET
    use_count = use_count + 1,
    used_at = CASE WHEN use_count + 1 >= max_uses THEN now() ELSE used_at END,
    used_by = CASE WHEN use_count + 1 >= max_uses AND max_uses = 1 THEN v_caller ELSE used_by END,
    status = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END
  WHERE id = v_invite.id;

  -- Audit log
  INSERT INTO public.department_audit_logs (
    department_id,
    action,
    actor_id,
    details
  ) VALUES (
    p_department_id,
    'invite_accepted',
    v_caller,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'code', p_code,
      'already_member', v_existing
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'department_id', p_department_id,
    'already_member', v_existing
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_department_invite(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_department_invite(TEXT, UUID) TO authenticated;
