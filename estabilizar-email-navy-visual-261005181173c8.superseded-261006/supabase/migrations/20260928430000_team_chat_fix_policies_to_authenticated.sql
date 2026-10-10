-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928430000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

DROP POLICY IF EXISTS "Admins can update any member row" ON public.team_conversation_members;

CREATE POLICY "Admins can update any member row" ON public.team_conversation_members FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Members can update own preferences" ON public.team_conversation_members;

CREATE POLICY "Members can update own preferences" ON public.team_conversation_members FOR UPDATE TO authenticated USING (profile_id = current_profile_id());

DROP POLICY IF EXISTS "Conversation creator or admin can delete" ON public.team_conversations;

CREATE POLICY "Conversation creator or admin can delete" ON public.team_conversations FOR DELETE TO authenticated USING (created_by = current_profile_id() OR is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;

CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts FOR SELECT TO authenticated USING (is_team_conversation_member(auth.uid(), conversation_id));

DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;

CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts FOR INSERT TO authenticated WITH CHECK (profile_id = current_profile_id());

DROP POLICY IF EXISTS "Members can update own receipts" ON public.team_message_receipts;

CREATE POLICY "Members can update own receipts" ON public.team_message_receipts FOR UPDATE TO authenticated USING (profile_id = current_profile_id());
