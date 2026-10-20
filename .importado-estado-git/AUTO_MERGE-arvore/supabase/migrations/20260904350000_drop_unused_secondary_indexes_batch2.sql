-- 20260904350000_drop_unused_secondary_indexes_batch2
-- Segundo lote: admin/metrics tables, idx_scan=0, non-PK, non-UNIQUE
DROP INDEX IF EXISTS public.idx_lpc_metrics_ran_at;
DROP INDEX IF EXISTS public.idx_warroom_alerts_dismissed_by;
DROP INDEX IF EXISTS public.idx_security_alerts_resolved_by;
DROP INDEX IF EXISTS public.idx_security_alerts_type;
DROP INDEX IF EXISTS public.idx_agent_stats_level;
DROP INDEX IF EXISTS public.idx_health_logs_connection_checked;
