DROP TRIGGER IF EXISTS update_level_on_xp_change ON public.agent_stats

CREATE TRIGGER update_level_on_xp_insert BEFORE INSERT ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION public.update_agent_level()
