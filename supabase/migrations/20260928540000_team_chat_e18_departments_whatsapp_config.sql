-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928540000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.departments ADD CONSTRAINT departments_whatsapp_mode_check CHECK (whatsapp_mode IN ('none','evolution','official'));

REVOKE UPDATE (whatsapp_api_key, whatsapp_instance_id) ON public.departments FROM authenticated;

CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL, p_instance_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid; v_is_admin boolean; BEGIN v_profile_id := public.current_profile_id(); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id; IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode'); END IF; UPDATE public.departments SET whatsapp_mode = p_whatsapp_mode, whatsapp_api_key = COALESCE(p_api_key, whatsapp_api_key), whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id), updated_at = now() WHERE id = p_department_id; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'department_not_found'); END IF; RETURN jsonb_build_object('ok', true); END; $f$;

REVOKE EXECUTE ON FUNCTION public.set_department_whatsapp_config(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_department_whatsapp_config(uuid, text, text, text) TO authenticated;
