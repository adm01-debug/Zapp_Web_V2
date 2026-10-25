# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

Data: 2026-10-25 (sessão ativa)
HEAD final: `29570d849b5decfe3c67ded75fcbd1aac71afb1c`

---

## 1. Inventário de workflows com falha na `main` (última execução)

Execuções da `main` verificadas via API às 2026-10-25 01:05 UTC.
Apenas `Auto Update PR Branches` tinha runs recentes visíveis — sem push em CI recente na main.
Nenhuma falha ativa em workflow obrigatório da `main` identificada nesta sessão.

---

## 2. Baseline local (pré-correções da sessão)

Ponto de referência: HEAD `1c3369932` (commit inicial da sessão anterior, pré-correções CI).

### Typecheck
- Baseline (main): ~93 erros (herdados de main — medidos em sessão anterior)
- Após correções deste branch: **0 erros TS** (tsc --noEmit = exit 0)
- Novos introduzidos: **0**

### Testes
- Arquivos que falharam no CI do PR (shard 1/3): `useTeamMessages.canal-e-reconexao.test.tsx`
- Arquivos que falharam no CI do PR (shard 2/3): `configuracoes.leituraErro.test.tsx`, `useDiagnosticsData.select.test.ts`
- Arquivos que falharam no CI do PR (shard 3/3): `useTeamChatPanel.search-antigas.test.tsx`
- Verificação: **todos falham igualmente no estado `main` (git stash + run = mesmos 13 erros)**
  → Pré-existentes, não introduzidos por este branch.

---

## 3. Falhas identificadas e corrigidas (sessões anterior + atual)

| # | Commit | Falha | Status |
|---|---|---|---|
| 1 | `9f4d324c0` | Playwright 1.63.0→1.64.1 mismatch | ✅ Corrigido |
| 2 | `709fccbbd` | Migration editada após commit (db-guard) | ✅ Corrigido |
| 3 | `709fccbbd` | `getBoundingClientRect` sem `writable: true` | ✅ Corrigido |
| 4 | `709fccbbd` | `fila-merge.mjs` catch sem `bloqueadas` | ✅ Corrigido |
| 5 | `4f0d14329` | `useTeamChatNotifications.canal-estavel`: mock `window.Notification` ausente | ✅ Corrigido |
| 6 | `29570d849` | `useTeamChatNotifications.canal-estavel`: referência `h.show` residual | ✅ Corrigido |
| 7 | — | Falhas pré-existentes da `main` (4 arquivos, 13 testes) | 🔄 Em análise |

---

## 4. Estado dos required checks em `29570d849`

| Check | Status |
|---|---|
| `🔎 TypeCheck` | ✅ success |
| `🧪 Unit Tests (1/3)` | ❌ failure (pré-existente da main) |
| `🧪 Unit Tests (2/3)` | ❌ failure (pré-existente da main) |
| `🧪 Unit Tests (3/3)` | ❌ failure (pré-existente da main) |
| `🏗️ Build` | ⏭️ skipped (depende de unit tests) |
| `🧩 Node CI Scripts` | ✅ success |
| `Contrato DB offline` | ⏳ in_progress |
| `🎭 E2E Tests (Playwright)` | ⏳ in_progress |
| `🔒 Security Audit` | ✅ success |

---

## 5. Commits da branch

| SHA | Descrição |
|---|---|
| `1c3369932` | commit inicial (sessão anterior) — feature HZ5-09 + CI |
| `9f4d324c0` | fix: alinhar playwright 1.63.0→1.64.1 |
| `709fccbbd` | fix: corrigir 3 falhas de CI |
| `d3f5a91d4` | chore: RELATORIO_CI.md + PENDENCIAS.md |
| `4f0d14329` | fix: mock window.Notification no teste canal-estavel |
| `29570d849` | fix: remover h.show residual no mock usePushNotifications |
