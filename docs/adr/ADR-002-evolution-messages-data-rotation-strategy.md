# ADR-002 — Data Rotation Strategy for evolution_messages_wpp2

**Status:** Proposed  
**Date:** 2026-06-12  
**Author:** Refactoring Agent  

---

## Context

`evolution_messages_wpp2` is the highest-volume table in the system. As of
the date above:

| Metric | Value |
|---|---|
| Live tuples | 1,831,706 |
| Dead tuples | 0 (autovacuum healthy) |
| Total size | **1,131 MB** |
| Growth rate | Est. ~3–5 M rows / month at current traffic |

Without a data rotation strategy, this table will continue to grow unbounded,
degrading query performance and increasing backup size over time.

### Extension availability (verified 2026-06-12)

| Extension | Installed | Version |
|---|---|---|
| `pg_partman` | **No** | — |
| `pg_cron` | **Yes** | 1.6 |
| `timescaledb` | **No** | — |

---

## Decision

**Adopt time-based range partitioning using `pg_partman`**, partitioning
`evolution_messages_wpp2` by `created_at` (monthly ranges).

This is the recommended long-term strategy. `pg_cron` (already installed) will
handle the automated partition maintenance.

---

## Implementation Plan

> **⚠️ Status: NOT yet implemented. Prerequisites must be satisfied first.**

### Step 1 — Install pg_partman

```sql
-- Run as superuser on the self-hosted Supabase instance
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
```

If pg_partman is not available in the Supabase extension catalog, the
alternative is the `pg_cron`-only approach (see Alternative B below).

### Step 2 — Create the partitioned table

```sql
-- New partitioned table (same schema as existing)
CREATE TABLE evolution_messages_wpp2_partitioned (
  LIKE evolution_messages_wpp2 INCLUDING ALL
) PARTITION BY RANGE (created_at);
```

### Step 3 — Register with pg_partman

```sql
SELECT partman.create_parent(
  p_parent_table   => 'public.evolution_messages_wpp2_partitioned',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => 'monthly',
  p_premake        => 3,          -- pre-create 3 future partitions
  p_start_partition => to_char(NOW() - INTERVAL '12 months', 'YYYY-MM-01')
);
```

### Step 4 — Backfill historical data

```sql
-- Migrate in batches to avoid lock contention
INSERT INTO evolution_messages_wpp2_partitioned
SELECT * FROM evolution_messages_wpp2
WHERE created_at < NOW() - INTERVAL '1 month';
-- Run iteratively in smaller date windows (e.g. 1 week at a time)
```

### Step 5 — Schedule maintenance via pg_cron

```sql
-- Run partman maintenance daily at 02:00 UTC
SELECT cron.schedule(
  'partman-maintenance-messages-wpp2',
  '0 2 * * *',
  $$CALL partman.run_maintenance_proc()$$
);
```

### Step 6 — Rename tables (zero-downtime swap)

```sql
BEGIN;
  ALTER TABLE evolution_messages_wpp2
    RENAME TO evolution_messages_wpp2_legacy;
  ALTER TABLE evolution_messages_wpp2_partitioned
    RENAME TO evolution_messages_wpp2;
COMMIT;
```

### Step 7 — Configure retention

```sql
UPDATE partman.part_config
SET retention          = '12 months',  -- keep 1 year of data
    retention_keep_table = false,       -- drop old partitions
    retention_keep_index = false
WHERE parent_table = 'public.evolution_messages_wpp2';
```

---

## Alternative B — pg_cron–only rotation (without pg_partman)

If pg_partman cannot be installed, use a deletion-based approach with
`pg_cron`:

```sql
-- Delete messages older than 12 months, in daily batches
SELECT cron.schedule(
  'cleanup-old-messages-wpp2',
  '30 2 * * *',
  $$
    DELETE FROM public.evolution_messages_wpp2
    WHERE created_at < NOW() - INTERVAL '12 months'
    AND ctid IN (
      SELECT ctid FROM public.evolution_messages_wpp2
      WHERE created_at < NOW() - INTERVAL '12 months'
      LIMIT 50000
    );
  $$
);
```

**Advantages:** zero prerequisites, immediate implementation.  
**Disadvantages:** creates dead tuples (requires VACUUM after each run),
less efficient than partition DROP, no historical data archive.

---

## Consequences

### Benefits (pg_partman approach)

- **Query performance** — the PostgreSQL planner prunes partitions automatically.
  Queries scoped to recent data (e.g. last 30 days) touch only 1–2 partitions
  instead of scanning 1.8 M rows.

- **Retention** — old partitions are DROPed atomically. No VACUUM cycle needed.
  Dropping a partition releases space instantly without table bloat.

- **Backup efficiency** — logical backups can exclude old partitions.

- **Zero downtime** — the rename swap (Step 6) is a single transaction; the
  application layer does not need to change.

### Risks

| Risk | Mitigation |
|---|---|
| pg_partman not in Supabase extension catalog | Use Alternative B until available, or install manually on self-hosted instance |
| Backfill time for 1.8 M rows | Batch in 1-week windows; run during low-traffic hours |
| `created_at` NULL values | Verify: `SELECT COUNT(*) FROM evolution_messages_wpp2 WHERE created_at IS NULL`. If any NULLs exist, handle before migration. |
| Composite PK `(id, instance_name)` includes no `created_at` | Partition key must be part of PK; adjust PK to `(id, instance_name, created_at)` before partitioning |
| Foreign keys referencing this table | Identify with `\d+` before swap |

### Next steps

1. Verify `pg_partman` availability on the self-hosted Supabase instance.
2. Check for NULL `created_at` values.
3. Identify foreign keys and dependent views.
4. Schedule migration during a maintenance window.
5. Create a rollback script (restore from `evolution_messages_wpp2_legacy`).

---

## References

- `evolution_messages_wpp2` — primary messages store for wpp2 instance
- ADR-001 — per-instance webhook events table pattern
- pg_partman docs: https://github.com/pgpartman/pg_partman
- pg_cron docs: https://github.com/citusdata/pg_cron
