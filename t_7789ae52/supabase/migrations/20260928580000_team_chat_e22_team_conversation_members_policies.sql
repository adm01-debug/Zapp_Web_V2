-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928580000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE UPDATE (conversation_id, profile_id, joined_at) ON public.team_conversation_members FROM authenticated;

DROP POLICY IF EXISTS "Members and admins can view conversation members" ON public.team_conversation_members;

DROP POLICY IF EXISTS "Members and admins can add conversation members" ON public.team_conversation_members;

DROP POLICY IF EXISTS "Members can leave or admins can remove" ON public.team_conversation_members;

DROP POLICY IF EXISTS "Admins can update any member row" ON public.team_conversation_members;

DROP POLICY IF EXISTS "Members can update own preferences" ON public.team_conversation_members;

CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated USING (profile_id = public.current_profile_id() OR EXISTS (SELECT 1 FROM public.team_conversation_members m2 WHERE m2.conversation_id = team_conversation_members.conversation_id AND m2.profile_id = public.current_profile_id()));

CREATE POLICY tcm_insert_member ON public.team_conversation_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.team_conversation_members m2 WHERE m2.conversation_id = team_conversation_members.conversation_id AND m2.profile_id = public.current_profile_id()) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.current_profile_id() AND p.role IN ('admin','supervisor')));

CREATE POLICY tcm_delete_own_or_admin ON public.team_conversation_members FOR DELETE TO authenticated USING (profile_id = public.current_profile_id() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.current_profile_id() AND p.role IN ('admin','supervisor')));

CREATE POLICY tcm_update_own_prefs ON public.team_conversation_members FOR UPDATE TO authenticated USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());
