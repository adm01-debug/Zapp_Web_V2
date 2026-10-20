-- M3 FIX: duplicate BEFORE trigger on agent_stats calling update_agent_level
-- Two triggers fire update_agent_level on every UPDATE:
--   on_agent_stats_update_level   (BEFORE UPDATE)
--   update_level_on_xp_change     (BEFORE INSERT UPDATE)
-- Simulation confirmed idempotent (same result both calls), but wastes
-- one calculate_level() invocation per UPDATE. Drop the duplicate.
-- Keep on_agent_stats_update_level (more specific name, UPDATE-only).
-- Keep update_level_on_xp_change for INSERT (the INSERT path is unique to it).
-- Solution: replace update_level_on_xp_change with INSERT-only variant.

DROP TRIGGER IF EXISTS update_level_on_xp_change ON public.agent_stats;

CREATE TRIGGER update_level_on_xp_insert
  BEFORE INSERT ON public.agent_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_level();
