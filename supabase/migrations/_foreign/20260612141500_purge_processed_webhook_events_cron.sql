-- Migration: pg_cron cleanup for evolution_webhook_events partitions
-- Date: 2026-06-12
-- REVISED: 2026-06-12 (bug fix — see BUGFIX section below)
--
-- ARCHITECTURE DISCOVERY (via testing):
--   evolution_webhook_events is a PostgreSQL LIST PARTITIONED TABLE (relkind='p'),
--   NOT a collection of independent tables as initially assumed.
--   Partitions: evolution_webhook_events_wpp2, _wpp_pink_test, _default, etc.
--   Partition key: instance_name (LIST partitioning)
--
-- BUGFIX: Initial version used pg_tables without relkind filter, which included
--   the parent partitioned table (relkind='p'). Deleting from the parent routes
--   to ALL partitions simultaneously, conflicting with per-partition batch limits
--   and causing double-counting in the result JSON.
--   FIX: Added JOIN to pg_class + relkind='r' filter to select only physical
--   partition tables, not the parent.
--
-- Strategy:
--   - Delete only rows where processed = true (never touch unprocessed events)
--   - Retention: 30 days (configurable via p_retention_days parameter)
--   - Batch size: 5000 rows per partition per run (avoids long locks)
--   - Dynamic loop: covers all physical partitions (relkind='r') only
--   - Schedule: daily at 03:30 UTC (off-peak, after other purge jobs at 03:00-04:45)
--   - Returns jsonb with per-partition and total deleted counts for observability

CREATE OR REPLACE FUNCTION public.fn_purge_processed_webhook_events(
  p_retention_days integer DEFAULT 30,
  p_batch_size     integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table  text;
  v_sql    text;
  v_count  bigint;
  v_total  bigint := 0;
  v_result jsonb  := '{}'::jsonb;
BEGIN
  -- Loop ONLY over physical partition tables (relkind = 'r').
  -- EXCLUDES the parent partitioned table (relkind = 'p') to prevent
  -- double-deletion: deleting from the parent routes to all partitions,
  -- which would conflict with per-partition batch limits.
  FOR v_table IN
    SELECT t.tablename
    FROM   pg_tables t
    JOIN   pg_class  c ON c.relname = t.tablename
                      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    WHERE  t.schemaname = 'public'
      AND  t.tablename  LIKE 'evolution_webhook_events%'
      AND  c.relkind    = 'r'   -- regular tables (partitions) only, NOT 'p' (partitioned parent)
    ORDER  BY t.tablename
  LOOP
    v_sql := format(
      $q$
        WITH deleted AS (
          DELETE FROM public.%I
          WHERE processed = true
            AND created_at < NOW() - INTERVAL '1 day' * $1
            AND ctid IN (
              SELECT ctid FROM public.%I
              WHERE processed = true
                AND created_at < NOW() - INTERVAL '1 day' * $1
              LIMIT $2
            )
          RETURNING 1
        )
        SELECT count(*) FROM deleted
      $q$,
      v_table, v_table
    );
    EXECUTE v_sql USING p_retention_days, p_batch_size INTO v_count;
    v_total := v_total + v_count;
    IF v_count > 0 THEN
      v_result := v_result || jsonb_build_object(v_table, v_count);
    END IF;
  END LOOP;

  v_result := v_result || jsonb_build_object('_total_deleted', v_total);
  RETURN v_result;
END;
$$;

-- Register pg_cron job (idempotent: unschedule first if it already exists)
SELECT cron.unschedule('purge-processed-webhook-events');
SELECT cron.schedule(
  'purge-processed-webhook-events',
  '30 3 * * *',  -- 03:30 UTC daily (after cleanup-old-notifications at 03:00)
  $$SELECT public.fn_purge_processed_webhook_events(30, 5000)$$
);

-- To run manually (e.g. one-off cleanup):
-- SELECT public.fn_purge_processed_webhook_events(30, 10000);
