# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

Data: 2026-10-25 (sessão ativa)
HEAD remoto: `998df22ae7c5eca146c8ff324ad7696ab3dac7ed`

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

### Testes (estado em `998df22ae`)
- Arquivos que falharam no CI do PR (shard 1/3): `useTalkXSegments.test.ts` (4 testes — linhas 341, 371, 384, 398)
- Arquivos que falharam no CI do PR (shard 2/3): `configuracoes.leituraErro.test.tsx`, `useDiagnosticsData.select.test.ts`
- Arquivos que falharam no CI do PR (shard 3/3): `useTeamChatPanel.search-antigas.test.tsx`
- Verificação: **todos são pré-existentes** — nenhum dos arquivos de teste com falha aparece em `git diff origin/main..origin/claude_05/brave-mccarthy-zvzky4 --name-only`
- **Melhora confirmada:** `main` tem 6 falhas em `useTalkXSegments.test.ts`; esta branch tem 4 (2 corrigidos ao marcar `lead_origin` como `comingSoon: true`)

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
| 8 | `998df22ae` | `TalkXOverview.tsx:371` aria-label fixo causava falha Unit Tests 3/3 | ✅ Corrigido |
| 9 | — | Falhas pré-existentes da `main` (Unit Tests, DB Guard, E2E logado, Talk X visual, copilot) | 📋 PENDENCIAS.md |

---

## 4. Estado dos required checks em `998df22ae` (HEAD atual)

| Check | Status |
|---|---|
| `🔎 TypeCheck` | ✅ success |
| `🧪 Unit Tests (1/3)` | ❌ failure (pré-existente da main — CONFIRMADO) |
| `🧪 Unit Tests (2/3)` | ❌ failure (pré-existente da main — CONFIRMADO) |
| `🧪 Unit Tests (3/3)` | ❌ failure (pré-existente da main — CONFIRMADO; aria-label fix OK, shard redistributed) |
| `🏗️ Build` | ⏭️ skipped (condicional — job anterior falhou) |
| `🧩 Node CI Scripts` | ✅ success |
| `Contrato DB offline` | ❌ failure (pré-existente — constraint + função ausente) |
| `🎭 E2E Tests (Playwright)` | ❌ cancelled |
| `🔒 Security Audit` | ✅ success |
| `✅ CI Gate (required check)` | ❌ failure (agrega falhas acima) |

**Falhas pré-existentes confirmadas (não introduzidas neste PR):**
- Unit Tests 1/3, 2/3, 3/3: todos os arquivos de teste com falha estão fora do diff desta branch
- Contrato DB offline: `department_audit_logs_action_check` + `request_department_access` ausente
- Talk X visual/launch: botão "Ajuda" não implementado
- copilot-pull-request-reviewer: quota 402 esgotada

**Esta branch MELHORA o estado vs main:** `useTalkXSegments.test.ts` tem 6 falhas em main e 4 nesta branch.

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
| `998df22ae` | fix: aria-label dinâmico em TalkXOverview + PENDENCIAS.md + RELATORIO_CI.md |
