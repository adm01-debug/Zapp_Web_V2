-- 20260902230000_fix_search_contacts_id_tiebreaker
-- search_contacts com tiebreaker c.id ASC (ORDER BY estavel).

CREATE OR REPLACE FUNCTION public.search_contacts with c.id ASC ORDER BY tiebreaker — see migration file for full SQL;
