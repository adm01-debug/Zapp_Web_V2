-- Objetivo: RPC accept_department_invite — valida código, incrementa uso, atualiza department_id
-- Estado ao vivo antes: sem RPC
-- Rollback: DROP FUNCTION public.accept_department_invite(text)

CREATE OR REPLACE FUNCTION public.accept_department_invite(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_invite public.department_invitations%ROWTYPE;
  v_profile_id uuid;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_invite
  FROM public.department_invitations
  WHERE code = upper(trim(p_code))
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;
  IF v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  END IF;
  UPDATE public.department_invitations SET
    use_count = use_count + 1,
    used_at = CASE WHEN use_count + 1 >= max_uses THEN now() ELSE used_at END,
    used_by = CASE WHEN use_count + 1 >= max_uses THEN v_profile_id ELSE used_by END,
    status  = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END
  WHERE id = v_invite.id;
  UPDATE public.profiles SET department_id = v_invite.department_id WHERE id = v_profile_id;
  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (v_invite.department_id, 'accept_invite', v_profile_id,
    jsonb_build_object('code', v_invite.code, 'invite_id', v_invite.id));
  RETURN jsonb_build_object('ok', true, 'department_id', v_invite.department_id);
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.accept_department_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_department_invite(text) TO authenticated;
