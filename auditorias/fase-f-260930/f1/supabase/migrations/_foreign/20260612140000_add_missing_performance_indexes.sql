-- Migration: add missing performance indexes
-- Date: 2026-06-12
-- Context: Identified via query-planner analysis (audit June 2026)
--
-- evolution_messages_wpp2.updated_at (1.83M rows):
--   Enables efficient "changes since last sync" queries and
--   recently-updated message lookups without full table scans.
--
-- empresas.created_at (51K rows):
--   Enables date-range queries and ordering without sequential scan.
--
-- Both created CONCURRENTLY (no table lock during creation).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evo_msgs_wpp2_updated_at
  ON public.evolution_messages_wpp2
  USING btree (updated_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empresas_created_at
  ON public.empresas
  USING btree (created_at DESC NULLS LAST);
