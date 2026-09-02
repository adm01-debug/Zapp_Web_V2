-- M1 CLEANUP: idx_wc_instance_id is redundant with the UNIQUE constraint
-- whatsapp_connections_instance_id_key (added in prior migration).
-- Simulation confirmed: idx_scan = 0 (never used by query planner).
-- Dropping saves ~1 index write per INSERT/UPDATE on whatsapp_connections.
-- Note: NULL instance_id (disconnected state) is intentional per app design;
-- the UNIQUE constraint already allows multiple NULLs (standard SQL semantics).

DROP INDEX IF EXISTS public.idx_wc_instance_id;
