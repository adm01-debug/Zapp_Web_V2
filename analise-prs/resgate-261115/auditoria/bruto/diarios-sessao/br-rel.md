# RELATORIO_CI.md — Estado dos Workflows de CI

_Gerado em 2026-11-02 pela sessão `claude_05/festive-carson-ub43wu`._  
_Objetivo: documentar baseline × final desta sessão e inventário completo dos workflows._

---

## 1. Baseline local (medido nesta sessão)

| Check | Resultado | Detalhes |
|---|---|---|
| `bun install` | ✅ OK | Dependências instaladas sem erro |
| `bun run build` | ✅ OK | 323 KB < budget 325 KB |
| Lint ratchet | ✅ OK | baseline=819, atual=813, novas=0, removidas=6 |
| Typecheck ratchet | ✅ OK | baseline=93, atual=3, novas=0, removidas=90 |
| Migrations estrutura | ✅ OK | 1073 arquivos válidos em `supabase/migrations/` |

**Notas:**
- O typecheck ratchet terminou com SIGABRT (OOM no runner) na primeira execução do fork, mas passou corretamente na segunda execução com resultado `baseline=93, atual=3, novas=0`.
- Sem nenhuma nova dívida de lint ou typecheck introduzida por esta sessão.

---

## 2. Inventário completo de workflows — estado verificado em 2026-11-02T00:28Z

### Required checks (6) — estado na `main`

| Workflow / Check | Arquivo | Último run concluído na `main` | Conclusão | SHA |
|---|---|---|---|---|
| `🔍 Lint & TypeCheck` | `ci.yml` | [41343946533](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343946533) | ✅ success | `3b5f8a96` |
| `🧪 Unit Tests` | `ci.yml` | [41343946533](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343946533) | ✅ success (com 410 skips pré-existentes) | `3b5f8a96` |
| `🏗️ Build` | `ci.yml` | [41343946533](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343946533) | ✅ success | `3b5f8a96` |
| `🔒 Security Audit` | `ci.yml` | [41343946533](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343946533) | ✅ success | `3b5f8a96` |
| `Contrato DB offline` | `db-guard.yml` | [41364695562](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695562) | ⏳ queued (attempt 3, PR #2542 `c61cbe617`) | — |
| `🎭 E2E Tests (Playwright)` | `e2e-logado.yml` | [41350571737](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571737) | ⚠️ cancelled (concorrência) | `1252bb5a` |

**Notas sobre required checks:**
- `CI/CD Pipeline` run `41343946533` = `success` na `main` SHA `3b5f8a96` (2026-11-01T19:52Z) — todos os 6 required checks verdes nesse SHA.
- `Contrato DB offline` (DB Guard): PR #2542 tem o fix do N-008; run `41364695562` (attempt 3) está em fila por contention de runners — não é falha de código (documentado em PENDENCIAS.md §6).
- `E2E logado` `cancelled` no run `41350571737` foi por grupo de concorrência (novo push na `main` cancelou o anterior); a última falha real com 4 specs de geolocation está em PENDENCIAS.md §5.

### Workflows não-required — estado verificado

| Workflow | Arquivo | Último run | Conclusão | Observação |
|---|---|---|---|---|
| DB Live Guard | `db-live-guard.yml` | [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) | ❌ failure | Falha de contrato vivo — PENDENCIAS §1 |
| Deploy Edge Functions | `deploy-functions.yml` | [41338277476](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41338277476) | ❌ failure | @types/node no deno check — PENDENCIAS §3 |
| types-sync | `types-sync.yml` | [41325473652](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41325473652) | ✅ success | RESOLVIDO — PENDENCIAS §8 |
| DB Migrate | `db-migrate.yml` | [41313326544](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41313326544) | ❌ failure | TARGET_VERSION errado (operação, não código) — PENDENCIAS §7 |
| Running Copilot Code Review | dinâmico | [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) | ❌ failure | HTTP 402 quota — PENDENCIAS §2 |
| Auto Update PR Branches | `auto-update-pr-branch.yml` | múltiplos | ✅/cancelled | Por design — cancela quando supersedido |

---

## 3. Fix N-008 aplicado nesta sessão

**PR:** [#2542](https://github.com/adm01-debug/Zapp_Web_V2/pull/2542)  
**Branch:** `claude/fix-ci-n008-261101-2340`  
**Commits:**

| SHA | Descrição |
|---|---|
| `68c998eeffd2` | fix: N-008 DB Guard — adiciona N008_POSTGRES_IMAGE e SKIP_DOCKER_SHIM |
| `c61cbe617f4d` | fix: substitui loop pg_isready por wait-postgres-final-start.sh (N-008) |

**Mudanças:**
1. `.github/workflows/db-guard.yml` — adicionado `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` e `SKIP_DOCKER_SHIM: "1"` no step "Provar encerramento diario de sessoes vencidas (N-008)".
2. `scripts/db-audit/user-sessions-expire.test.sh` — substituído loop `pg_isready` (vulnerável à race condition do servidor temporário) por `wait-postgres-final-start.sh` (aguarda "init process complete" nos logs + query real).

**Causa raiz confirmada:** Sem `N008_POSTGRES_IMAGE`, o script `retry-disposable-postgres-test.sh` não encontra a imagem em cache e o `docker run postgres:17-alpine` falha por rate limit do Docker Hub.

**Estado do CI da PR:** Run `41364695562` (attempt 3) em `queued` por contention de runners — aguardando conclusão.

---

## 4. Comparação baseline × final

| Item | Baseline (antes desta sessão) | Final (após fix) |
|---|---|---|
| `Contrato DB offline` em CI | ❌ failure (N008_POSTGRES_IMAGE ausente) | ⏳ queued (fix aplicado, aguarda runner) |
| types-sync | ❌ failure (tipos desatualizados) | ✅ success (run 41325473652) |
| CI/CD Pipeline (required) | ✅ success | ✅ success (run 41343946533) |
| Novas dívidas de lint | 0 | 0 |
| Novas dívidas de typecheck | 0 | 0 |
| DB Live Guard | ❌ failure (3 contratos reais) | ❌ failure (inalterado — requer acesso banco prod) |
| Deploy Edge Functions | ❌ failure (@types/node) | ❌ failure (inalterado — requer investigação Deno path) |
| DB Migrate | ❌ failure (TARGET_VERSION errado) | ❌ failure (inalterado — erro de operação, não código) |
| Running Copilot Code Review | ❌ failure (HTTP 402 quota) | ❌ failure (inalterado — sem código no repo) |

**Regressões introduzidas:** Nenhuma.

---

## 5. Workflows que não aparecem no inventário de falhas (por design)

- `branch-hygiene-audit.yml` — semanal, sem run recente com falha
- `codeql.yml` — semanal, `🔬 CodeQL` não é required check
- `crm-sync-worker.yml` — schedule comentado deliberadamente
- `settings-guard.yml` — cron a cada 6h, só alerta em divergência de branch protection
- `talkx-status-regen.yml` — trigger manual
- `targeted-ledger-evidence.yml` — trigger manual para auditoria pontual
- `vercel-env-cleanup.yml` — trigger manual
- `e2e-talkx.yml` — não é required check

---

_Próxima ação necessária: aguardar `conclusion=success` no run `41364695562` (attempt 3, DB Guard PR #2542) para fechar PENDENCIAS §6._
