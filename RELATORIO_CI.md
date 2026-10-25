# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

Data: 2026-10-25 (sessão ativa)
HEAD remoto anterior: `a7b88798467dcd2bae08aa28d51d5a4697903dec`

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
| 7 | `a7b88798` | Âncoras ESTADO.md desatualizadas (useKnowledgeBase :126→:130, :197→:201) | ✅ Corrigido |
| 8 | — | `TalkXOverview.tsx:371` aria-label fixo causava falha Unit Tests 3/3 | ✅ Corrigido (push atual) |
| 9 | — | Falhas pré-existentes da `main` (DB Guard, E2E logado, Talk X visual, copilot) | 📋 PENDENCIAS.md |

---

## 4. Estado dos required checks em `a7b88798` (pré-fix Unit Tests 3/3)

| Check | Status |
|---|---|
| `🔎 TypeCheck` | ✅ success |
| `🧪 Unit Tests (1/3)` | ❌ failure (pré-existente da main — CONFIRMADO) |
| `🧪 Unit Tests (2/3)` | ❌ failure (pré-existente da main — CONFIRMADO) |
| `🧪 Unit Tests (3/3)` | ❌ failure — aria-label fixo em TalkXOverview.tsx (CORRIGIDO neste push) |
| `🏗️ Build` | — |
| `🧩 Node CI Scripts` | ✅ success |
| `Contrato DB offline` | ❌ pré-existente (department_audit_logs constraint + função ausente) |
| `🎭 E2E Tests (Playwright)` | aguardando resultados |
| `🔒 Security Audit` | ✅ success |

**Falhas pré-existentes confirmadas (não introduzidas neste PR):**
- Unit Tests 1/3, 2/3: mesmos arquivos falham em `main` (git stash + run)
- Contrato DB offline: `department_audit_logs_action_check` + `request_department_access` ausente
- Talk X visual/launch: botão "Ajuda" não implementado
- copilot-pull-request-reviewer: quota 402 esgotada

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
| `a7b88798` | fix: âncoras ESTADO.md useKnowledgeBase :130 e :201 |
| (este push) | fix: aria-label dinâmico em TalkXOverview + PENDENCIAS.md + RELATORIO_CI.md |
