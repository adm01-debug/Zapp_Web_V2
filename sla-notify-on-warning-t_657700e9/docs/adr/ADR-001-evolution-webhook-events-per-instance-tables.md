# ADR-001 — PostgreSQL LIST Partitioning for evolution_webhook_events

**Status:** Accepted (corrected — initial version had wrong architecture understanding)  
**Date:** 2026-06-12  
**Revised:** 2026-06-12 (testing revealed true architecture)  
**Author:** Refactoring Agent  

---

## Correction Notice

The initial version of this ADR incorrectly described `evolution_webhook_events_*`
as a collection of independent tables. Exhaustive testing on 2026-06-12 revealed
the actual design: **PostgreSQL LIST partitioning by `instance_name`**.

---

## Context

The Evolution API sends webhook events for every connected WhatsApp instance.
These are stored in `evolution_webhook_events`, a **LIST-partitioned table**.

### Verified Architecture (2026-06-12)

```sql
-- Parent: LIST partitioned table (relkind='p'), no physical storage
evolution_webhook_events                   PARTITION BY LIST (instance_name)

-- Partitions (relkind='r', physical storage):
evolution_webhook_events_wpp2              FOR VALUES IN ('wpp2')
evolution_webhook_events_wpp_pink_test     FOR VALUES IN ('wpp_pink_test')
evolution_webhook_events_financeiro        FOR VALUES IN ('financeiro')
evolution_webhook_events_compras           FOR VALUES IN ('compras')
evolution_webhook_events_logistica         FOR VALUES IN ('logistica')
evolution_webhook_events_marketing         FOR VALUES IN ('marketing')
evolution_webhook_events_artes             FOR VALUES IN ('artes')
evolution_webhook_events_gravacao          FOR VALUES IN ('gravacao')
evolution_webhook_events_comercial_01..15  FOR VALUES IN ('comercial_01'..'comercial_15')
evolution_webhook_events_default           DEFAULT  -- catches any unlisted instance
```

**Total:** 1 parent + 24 physical partitions = 25 pg_tables entries.

### Key Discovery: `pg_total_relation_size(parent) = 0`

The parent table (`evolution_webhook_events`) shows 0 bytes in `pg_relation_size`
because partitioned table parents have **no physical heap storage** — all data
lives in the leaf partitions. `SELECT COUNT(*) FROM evolution_webhook_events`
returns the total across ALL partitions via partition pruning.

Current data distribution (2026-06-12, after partial cleanup):

| Partition | Rows | Total Size |
|---|---|---|
| `evolution_webhook_events_wpp2` | ~18,000 | 134 MB |
| `evolution_webhook_events_wpp_pink_test` | ~32,000 | 50 MB |
| `evolution_webhook_events_default` | 0 | 200 KB |
| All `comercial_*`, `artes`, etc. | 0 each | 32-40 KB each |
| **Total via parent** | ~50,000+ | ~185 MB |

### Schema (all partitions inherit from parent)

```sql
id             uuid NOT NULL
event_type     text NOT NULL
instance_name  text NOT NULL    -- the LIST partition key
remote_jid     text
from_me        boolean
message_type   text
push_name      text
payload        jsonb NOT NULL
processed      boolean
processed_at   timestamptz
error_message  text
created_at     timestamptz
status         webhook_event_status NOT NULL
```

---

## Decision

**Keep the existing LIST partitioned table design.** This is already the correct
architecture for this use case.

### Why this is already the right design

1. **PostgreSQL partition pruning** — queries that filter on `instance_name`
   automatically target only the relevant partition, avoiding full scans.

2. **Independent I/O** — each partition has its own heap file; heavy write
   activity on `wpp2` does not block reads on `wpp_pink_test`.

3. **Trivial cross-instance queries** — `SELECT ... FROM evolution_webhook_events`
   queries ALL instances transparently; partition pruning handles the routing.

4. **Simple new instance onboarding** — adding a new partition is one DDL:
   ```sql
   CREATE TABLE evolution_webhook_events_nova_instancia
     PARTITION OF evolution_webhook_events
     FOR VALUES IN ('nova_instancia');
   ```

5. **Schema consistency guaranteed** — the partition schema is inherited from
   the parent; no risk of drift across partitions for inherited columns.

---

## Consequences

### Benefits

- Zero application code changes when adding a new instance partition.
- `pg_partman` (when installed) can automate sub-partitioning by time if needed.
- `VACUUM` and `ANALYZE` can be run per-partition without blocking other instances.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Default partition catches unexpected instances silently | Low | Monitor `SELECT COUNT(*) FROM evolution_webhook_events_default` |
| DDL on parent doesn't always propagate to partitions (e.g., indexes must be created per-partition) | Medium | Always create indexes directly on each partition; verify with `\d+ partition_name` |
| `pg_total_relation_size(parent)` = 0 confuses monitoring | Low | Always measure sizes via individual partitions or `pg_total_relation_size(partition_name)` |

### Operational Notes for `fn_purge_processed_webhook_events`

The cleanup function **must loop over physical partitions only** (relkind='r'),
**NOT the parent table** (relkind='p'). Deleting from the parent would route
to all partitions and bypass per-partition batch limits.

Verified fix (2026-06-12):
```sql
SELECT t.tablename
FROM   pg_tables t
JOIN   pg_class  c ON c.relname = t.tablename
WHERE  t.schemaname = 'public'
  AND  t.tablename  LIKE 'evolution_webhook_events%'
  AND  c.relkind    = 'r'   -- physical partitions only
ORDER  BY t.tablename;
```

---

## References

- `supabase/migrations/20260612141500_purge_processed_webhook_events_cron.sql`
  — pg_cron cleanup function (fixed with relkind='r' filter)
- `supabase/functions/_shared/evolution-webhook-handlers.ts`
  — handler that writes to partitions via parent table
- `supabase/functions/_shared/evolution-helpers.ts`
  — instance name resolution cache (5 min TTL)
- ADR-002 — pg_partman data rotation strategy for `evolution_messages_wpp2`
