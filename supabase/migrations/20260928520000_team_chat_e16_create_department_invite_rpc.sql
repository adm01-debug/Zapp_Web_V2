-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928520000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.create_department_invite(p_department_id uuid, p_max_uses integer DEFAULT 1, p_expires_hours integer DEFAULT 72) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid; v_is_admin boolean; v_code text; v_invite_id uuid; BEGIN v_profile_id := public.current_profile_id(); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id; IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; v_code := upper(substring(replace(encode(gen_random_bytes(9), 'base64'), '/', 'A'), 1, 12)); INSERT INTO public.department_invitations(department_id, code, max_uses, expires_at, created_by, status) VALUES (p_department_id, v_code, GREATEST(1, p_max_uses), now() + (p_expires_hours || ' hours')::interval, v_profile_id, 'pending') RETURNING id INTO v_invite_id; INSERT INTO public.department_audit_logs(department_id, action, profile_id, details) VALUES (p_department_id, 'create_invite', v_profile_id, jsonb_build_object('invite_id', v_invite_id, 'code', v_code, 'max_uses', p_max_uses)); RETURN jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code); END; $f$;

REVOKE EXECUTE ON FUNCTION public.create_department_invite(uuid, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_department_invite(uuid, integer, integer) TO authenticated;
