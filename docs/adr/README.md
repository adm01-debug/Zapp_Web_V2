# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the zapp-web-v2 project.
ADRs capture significant architectural choices, the context that led to them, and
their consequences — both positive and negative.

## What is an ADR?

An ADR is a short document (typically 1-3 pages) that records:
- **Status** — Proposed / Accepted / Deprecated / Superseded
- **Context** — The problem or situation requiring a decision
- **Decision** — The chosen approach
- **Consequences** — What happens as a result

## Index

| # | File | Title | Status | Date |
|---|---|---|---|---|
| 001 | [ADR-001-evolution-webhook-events-per-instance-tables.md](./ADR-001-evolution-webhook-events-per-instance-tables.md) | Per-Instance Webhook Event Tables Pattern | Accepted | 2026-06-12 |
| 002 | [ADR-002-evolution-messages-data-rotation-strategy.md](./ADR-002-evolution-messages-data-rotation-strategy.md) | Data Rotation Strategy for evolution_messages_wpp2 | Proposed | 2026-06-12 |

## Guidelines

When adding a new ADR:

1. Use the next sequential number: `ADR-NNN-short-title.md`
2. Copy the structure from an existing ADR
3. Set status to **Proposed** until the decision is implemented
4. Update this README index
5. Reference related ADRs in the **References** section

## Naming Convention

```
ADR-{NNN}-{kebab-case-title}.md
```

Examples:
- `ADR-003-react-query-global-defaults.md`
- `ADR-004-supabase-realtime-subscription-strategy.md`

## Status Lifecycle

```
Proposed → Accepted → (Deprecated | Superseded by ADR-NNN)
```

---

*Last updated: 2026-06-12*
