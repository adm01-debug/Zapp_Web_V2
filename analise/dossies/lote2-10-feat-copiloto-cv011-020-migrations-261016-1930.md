# Dossiê — `claude/feat-copiloto-cv011-020-migrations-261016-1930`

**Veredito:** PENDENTE / RISCO  
**Confiança:** ALTA  
**Tip SHA:** `b30b8efb9d855bfc05b9af294e83652919e037f6`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/claude/feat-copiloto-cv011-020-migrations-261016-1930 origin/main` → `fbd422204` (base comum existe)
- `git diff fbd422204..origin/claude/feat-copiloto-cv011-020-migrations-261016-1930 --stat` → 9 arquivos

### Migrations ausentes da main (6 arquivos)

| Migration | git show origin/main:<arquivo> | Ledger DB |
|---|---|---|
| `20261016193000_copilot_sessions.sql` | `fatal: Path ... does not exist` | 0 rows |
| `20261016193100_copilot_instructions.sql` | `fatal: Path ... does not exist` | 0 rows |
| `20261016193200_copilot_context.sql` | `fatal: Path ... does not exist` | 0 rows |
| `20261016193300_copilot_actions.sql` | `fatal: Path ... does not exist` | 0 rows |
| `20261016193400_copilot_feedback.sql` | `fatal: Path ... does not exist` | 0 rows |
| `20261016193500_copilot_retention.sql` | `fatal: Path ... does not exist` | 0 rows |

Ledger query: `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version LIKE '20261016193%'` → 0

### Risco

6 migrations de DDL (tabelas do módulo Copilot: `copilot_sessions`, `copilot_instructions`, etc.) **nunca aplicadas em produção** e **ausentes da main**. O schema do banco de produção não tem essas tabelas. Código na branch que depende dessas tabelas quebraria em produção se mergeado sem aplicar as migrations.

## Conclusão

Branch PENDENTE com desenvolvimento ativo do módulo Copiloto (CV011–020). 6 migrations DDL nunca aplicadas. **Não deletar.** Requer: (1) decisão sobre continuidade do módulo; (2) se continuar, aplicar migrations via fluxo arquivo→PR→merge→`db-migrate.yml` conforme CLAUDE.md seção 1.
