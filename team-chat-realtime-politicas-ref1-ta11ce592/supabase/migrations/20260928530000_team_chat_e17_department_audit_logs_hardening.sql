-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928530000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE INSERT, UPDATE, DELETE ON public.department_audit_logs FROM authenticated;

DROP POLICY IF EXISTS "dept_audit_select_authenticated" ON public.department_audit_logs;

DROP POLICY IF EXISTS "dept_audit_insert_authenticated" ON public.department_audit_logs;

CREATE POLICY dept_audit_select_own_dept ON public.department_audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.current_profile_id() AND p.department_id = department_audit_logs.department_id AND p.role IN ('admin','supervisor')));

ALTER TABLE public.department_audit_logs ADD COLUMN IF NOT EXISTS profile_name text;

ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group'));

CREATE OR REPLACE FUNCTION public.department_audit_logs_fill_profile_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF NEW.profile_id IS NOT NULL AND NEW.profile_name IS NULL THEN SELECT name INTO NEW.profile_name FROM public.profiles WHERE id = NEW.profile_id; END IF; RETURN NEW; END; $f$;

REVOKE EXECUTE ON FUNCTION public.department_audit_logs_fill_profile_name() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS department_audit_logs_fill_profile_name_trig ON public.department_audit_logs;

CREATE TRIGGER department_audit_logs_fill_profile_name_trig BEFORE INSERT ON public.department_audit_logs FOR EACH ROW EXECUTE FUNCTION public.department_audit_logs_fill_profile_name();
