CREATE INDEX IF NOT EXISTS idx_agent_achievements_earned_at ON public.agent_achievements(earned_at);
CREATE INDEX IF NOT EXISTS idx_csat_surveys_created_at_agent ON public.csat_surveys(created_at, agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to_gamif ON public.contacts(assigned_to) WHERE assigned_to IS NOT NULL;
UPDATE public.agent_stats SET current_streak = messages_sent, best_streak = messages_sent, updated_at = now() WHERE current_streak = 0 AND messages_sent > 0;
