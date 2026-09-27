CREATE TABLE IF NOT EXISTS public.department_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE, action text NOT NULL, profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX IF NOT EXISTS idx_dept_audit_logs_dept_id ON public.department_audit_logs(department_id, created_at DESC);

ALTER TABLE public.department_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.department_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE, code text NOT NULL UNIQUE, created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX IF NOT EXISTS idx_dept_invites_dept_id ON public.department_invites(department_id);

CREATE INDEX IF NOT EXISTS idx_dept_invites_code ON public.department_invites(code);

ALTER TABLE public.department_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.accept_department_invite(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_invite public.department_invites%ROWTYPE; v_user_id uuid; BEGIN SELECT auth.uid() INTO v_user_id; IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT * INTO v_invite FROM public.department_invites WHERE code = upper(trim(p_code)) AND expires_at > now() LIMIT 1; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code'); END IF; UPDATE public.profiles SET department_id = v_invite.department_id WHERE id = v_user_id; INSERT INTO public.department_audit_logs(department_id, action, profile_id, details) VALUES (v_invite.department_id, 'accept_invite', v_user_id, jsonb_build_object('code', v_invite.code, 'invite_id', v_invite.id)); RETURN jsonb_build_object('ok', true, 'department_id', v_invite.department_id); END; $$;

GRANT EXECUTE ON FUNCTION public.accept_department_invite(text) TO authenticated;
