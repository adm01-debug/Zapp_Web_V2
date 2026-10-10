-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929220000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.team_reactions_dedup_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF EXISTS (SELECT 1 FROM public.team_message_reactions WHERE message_id = NEW.message_id AND profile_id = NEW.profile_id AND emoji = NEW.emoji) THEN RETURN NULL; END IF; RETURN NEW; END; $f$;

REVOKE EXECUTE ON FUNCTION public.team_reactions_dedup_guard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_reactions_dedup_guard() TO authenticated;

DROP TRIGGER IF EXISTS team_reactions_dedup_trig ON public.team_message_reactions;

CREATE TRIGGER team_reactions_dedup_trig BEFORE INSERT ON public.team_message_reactions FOR EACH ROW EXECUTE FUNCTION public.team_reactions_dedup_guard();

ALTER TABLE public.team_message_reactions ADD CONSTRAINT team_reactions_emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 8);

DROP POLICY IF EXISTS "Users can add reactions" ON public.team_message_reactions;

DROP POLICY IF EXISTS "Users can remove own reactions" ON public.team_message_reactions;

DROP POLICY IF EXISTS "Users can view reactions" ON public.team_message_reactions;

CREATE POLICY "reactions_select" ON public.team_message_reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.team_conversation_members tcm JOIN public.team_messages tm ON tm.id = team_message_reactions.message_id WHERE tcm.conversation_id = tm.conversation_id AND tcm.profile_id = public.current_profile_id()));

CREATE POLICY "reactions_insert" ON public.team_message_reactions FOR INSERT TO authenticated WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "reactions_delete" ON public.team_message_reactions FOR DELETE TO authenticated USING (profile_id = public.current_profile_id());
