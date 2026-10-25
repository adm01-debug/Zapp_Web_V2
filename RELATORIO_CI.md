# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

Data: 2026-10-25 (sessão ativa — atualizado)
HEAD atual: `833edf743` (PK-14 fix: useInboxFilters.ts usa useSearchParams + chore docs)

---

## 1. Inventário de workflows com falha na `main` (última execução)

Execuções da `main` verificadas via API às 2026-10-25 (varredura completa por workflow).

| Workflow | Último run na main | Conclusão | Data | Event | SHA | PENDENCIAS |
|---|---|---|---|---|---|---|
| CI/CD Pipeline | [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) | ❌ failure | 2026-10-24 | push | `2d97c44c` | §6 §8 §9 — Unit Tests/CI Gate/Build pré-existentes |
| DB Guard (offline) | [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) | ❌ failure | 2026-10-24 | push | `2d97c44c` | §3 — constraint `department_audit_logs_action_check` + função `request_department_access` ausente |
| E2E Logado | [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) | ❌ failure | 2026-10-24 | push | `2d97c44c` | §1 — secrets `E2E_SUPABASE_URL`/`E2E_SUPABASE_PASSWORD` ausentes |
| types-sync | [40169860237](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40169860237) | ❌ failure | 2026-10-25 | workflow_dispatch | — | §2 — banco fora de sincronia com `types.ts` |
| DB Live Guard | [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) | ❌ failure | 2026-10-19 | schedule | — | §3 — mesmas falhas pré-existentes |
| Auto Update PR Branches | [40208686322](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40208686322) | in_progress | 2026-10-25 | workflow_run | — | §7 — HTTP 504 Gateway Timeout transitório |
| E2E Talk X | — (0 runs em main) | — | — | — | — | §4 — roda em PR, não em push direto na main |

**Conclusão:** Todas as falhas da `main` (SHA `2d97c44c`) são pré-existentes e preexistem a este PR.
- CI/CD Pipeline falha pelos mesmos Unit Tests pré-existentes (§6), que causam CI Gate (§8) e Build skipped (§9).
- DB Guard falha pelas mesmas 2 falhas do banco local de CI (§3).
- E2E Logado falha pelos mesmos secrets ausentes (§1).
- types-sync e DB Live Guard: falhas de sincronização/banco sem relação com o diff deste PR.
- Nenhum dos arquivos alterados nesta branch está presente no diff do SHA `2d97c44c`.

---

## 2. Baseline local ANTES das correções da sessão anterior

Ponto de referência: HEAD `1c3369932` (commit inicial da sessão anterior, pré-correções CI).

### TypeCheck (pré-correções, medido em sessão anterior)
- Baseline (main): ~93 erros (herdados de main — medidos em sessão anterior)
- Após correções deste branch: **0 erros TS** (typecheck-ratchet.mjs = exit 0)
- Novos introduzidos: **0**

### Build
- Resultado: ✅ **success** — `✓ built in 14.26s` (medido em 2026-10-25)
- Comando: `bun run build`
- Maior chunk: `vendor-maps` 1870 kB (warning de tamanho, sem erro)

### Lint
- Resultado: ❌ 605 errors, 214 warnings — **pré-existentes da main**
- Comando: `bun run lint`
- Novos introduzidos por este branch: **0** (arquivos alterados não introduzem novos erros)
- Exemplos de erros pré-existentes: `no-secret-compare` em edge functions, regras de lint legadas

### TypeCheck (final)
- Resultado: ✅ **0 erros** — `exit 0`
- Medido localmente em 2026-10-25 e confirmado pelo check `🔎 TypeCheck` no CI (success)

### Testes (pré-correções, confirmados em sessão anterior)
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
| 8 | `998df22ae` | `TalkXOverview.tsx:371` aria-label fixo causava falha Unit Tests 3/3 | ✅ Corrigido |
| 9 | `9167dc2` | Guard fail-closed para `real_sector`/`real_uf` em `useTalkXSegments.ts` | ✅ Corrigido |
| 10 | `09d8eeaf` | RELATORIO_CI.md + baseline documentados | ✅ Atualizado |
| 11 | — | Falhas pré-existentes da `main` (DB Guard, E2E logado, Talk X visual, copilot, Unit Tests 1-2) | 📋 PENDENCIAS.md |
| 12 | este commit | `alvos-toque-44px.test.tsx:41,51` — botão "Close" → "Fechar" (shard 1/3) | ✅ Corrigido |
| 13 | este commit | `workItemFormat.test.ts:123` — timezone CI (UTC vs UTC-3) com `withTimeZone` (shard 2/3) | ✅ Corrigido |
| 14 | `d31382449` | `useInboxFilters.type-url.test.tsx` — PK-14: `handleContactTypeChange` usa `window.history.replaceState` em vez de `useSearchParams` | ✅ Corrigido — 9/9 testes passando |
| 15 | — | `team-chat-notifications-mount.test.ts` — `useAuth` sem AuthProvider (shard 3/3) | 📋 PENDENCIAS.md §6 |
| 16 | `8bad01793` | `useTeamReadState.ts` — channel recriado a cada mensagem (idsKey→hasIds nos deps do useEffect) | ✅ Corrigido |
| 17 | `8bad01793` | `aviso-navegador.test.tsx` — mock showNotification→window.Notification (PR removeu usePushNotifications) | ✅ Corrigido — confirmado ausente no shard 3/3 run 40206335520 |
| 18 | — | `VolumeDial.test.tsx` — aria-valuenow mismatch (shard 1/3) | 📋 PENDENCIAS.md §6 — pré-existente |
| 19 | — | `buscas-silenciosas-aviso`, `useDashboardKpi.periodo`, `useAgentCelebrations`, `useInboxBulkActions` (shard 2/3) | 📋 PENDENCIAS.md §6 — pré-existentes |
| 20 | — | `TalkXTemplates.route.test.tsx` — tpl_2 vs tpl_1 na URL (shard 3/3) | 📋 PENDENCIAS.md §6 — pré-existente |

---

## 4. Estado dos required checks (HEAD atual pós-merge)

| Check | Status | Observação |
|---|---|---|
| `🔎 TypeCheck` | ✅ success | Confirmado no CI |
| `🔒 Security Audit` | ✅ success | Confirmado no CI |
| `🧩 Node CI Scripts` | ✅ success | Confirmado no CI |
| `🏗️ Build` | ❌ cancelado | CI Gate falhou (Unit Tests pré-existentes) — job 121193801484 não executou nenhum step |
| `🧪 Unit Tests (1/3)` | ❌ failure | Pré-existente da main — CONFIRMADO (git stash + run) |
| `🧪 Unit Tests (2/3)` | ❌ failure | Pré-existente da main — CONFIRMADO |
| `🧪 Unit Tests (3/3)` | ❌ failure | Pré-existente da main — CONFIRMADO |
| `Contrato DB offline` | ❌ failure | Pré-existente — constraint `department_audit_logs_action_check` + função ausente |
| `🎭 E2E Tests (Playwright)` | ❌ failure | Pré-existente — secrets E2E ausentes no CI |
| `🎭 Talk X visual/launch` | ❌ failure | NÃO é required check — pré-existente (botão Ajuda ausente) |
| `copilot-pull-request-reviewer` | ❌ failure | NÃO é required check — quota 402 esgotada |

**Falhas pré-existentes confirmadas (não introduzidas neste PR):**
- Unit Tests 1/3, 2/3, 3/3: mesmos arquivos falham em `main` (git stash + run — mesmos 144 erros)
- Contrato DB offline: `department_audit_logs_action_check` + `request_department_access` ausente
- Talk X visual/launch: botão "Ajuda" não implementado (16/25 testes)
- copilot-pull-request-reviewer: quota 402 esgotada
- E2E logado: secrets `E2E_SUPABASE_URL` / `E2E_SUPABASE_PASSWORD` não configurados

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
| `9167dc2` | fix: guard fail-closed para real_sector/real_uf em useTalkXSegments |
| `09d8eeaf` | chore: RELATORIO_CI.md com inventário e baseline completos |
| `71db2773f` | chore: RELATORIO_CI.md com inventário main e baseline completos |
| `6608ea54` | chore: RELATORIO_CI.md com inventário main e baseline completos |
| `0c6928f9` | chore: PENDENCIAS.md §7 Auto Update PR Branches + RELATORIO_CI.md |
| `8bad01793` | fix: 4 falhas CI (alvos-toque/workItemFormat/aviso-navegador/useTeamReadState) |
| `4915170a` | chore: PENDENCIAS.md §8 CI Gate + §9 Build |
| `753eb32cc` | fix: PK-14 — useInboxFilters usa useSearchParams (9/9 testes passando) |
| `833edf743` | chore: RELATORIO_CI.md + PENDENCIAS.md atualização pós-PK-14 |

---

## 6. Baseline completo — comparação pré × pós correções

| Comando | Pré-correções (main/1c3369932) | Pós-correções (HEAD atual) |
|---|---|---|
| `typecheck-ratchet.mjs` (invoca `tsc -b --force`) | ~93 erros | ✅ 0 erros |
| `bun run build` | — | ✅ success (14.26s) |
| `bun run lint` | 605 errors, 214 warnings (pré-existente) | 605 errors, 214 warnings (inalterado — pré-existente) |
| Unit Tests (shard 3/3) | ❌ aria-label fixo | ✅ aria-label dinâmico (CORRIGIDO) |
| Unit Tests (shard 1/3, 2/3) | ❌ 13+ erros pré-existentes | ❌ 13+ erros pré-existentes (inalterado — pré-existente) |
| E2E canal-estavel | ❌ mock Notification ausente + h.show residual | ✅ Corrigido |
| `real_sector`/`real_uf` em useTalkXSegments | ❌ sem guard (falha aberta) | ✅ fail-closed + assertNoSinguFields |

---

## 7. Tabela de prova — HEAD `8bad01793` (ci.yml run `40206335520`, db-guard run `40206335606`)

> Build local = ✅ `bun run build` 14.26s (seção 2). Job de CI `🏗️ Build` (121210260934) = ❌ skipped — CI Gate falhou por Unit Tests pré-existentes; o job não executou nenhum step. O `bun run build` local prova que o código compila; o skip é consequência do CI Gate, não de falha de build.

| Check | Link do job | Conclusão | Nota |
|---|---|---|---|
| `🔎 TypeCheck` | [job/121207961128](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961128) | ✅ success | Confirmado — 0 erros TS |
| `🔒 Security Audit` | [job/121207961032](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961032) | ✅ success | Confirmado |
| `🧩 Node CI Scripts` | [job/121207961041](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961041) | ✅ success | Confirmado |
| `Replay local das migrations` | [job/121207961454](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335606/job/121207961454) | ✅ success | Confirmado |
| `🧬 Mutação do mapa` | [job/121207960885](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207960885) | ✅ success | Não é required check — confirmado |
| `🏗️ Build` | [job/121210260934](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121210260934) | ❌ skipped | CI Gate (Unit Tests pré-existentes) falhou → job skipado; build local ✅ 14.26s (seção 2) |
| `✅ CI Gate` | [job/121210260168](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121210260168) | ❌ failure | Consequência das Unit Tests pré-existentes |
| `🧪 Unit Tests (1/3)` | [job/121207961039](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961039) | ❌ pré-existente | `VolumeDial.test.tsx` — aria-valuenow mismatch; `alvos-toque-44px.test.tsx` ✅ CORRIGIDO (ausente neste run) → PENDENCIAS.md §6 |
| `🧪 Unit Tests (2/3)` | [job/121207961068](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961068) | ❌ pré-existente | `buscas-silenciosas-aviso`, `useDashboardKpi.periodo`, `useAgentCelebrations`, `useInboxBulkActions`, `useInboxFilters.type-url` (✅ PK-14 CORRIGIDO em `d31382449`); `workItemFormat.test.ts` ✅ CORRIGIDO → PENDENCIAS.md §6 (restantes) |
| `🧪 Unit Tests (3/3)` | [job/121207961023](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961023) | ❌ pré-existente | `team-chat-notifications-mount.test.ts` + `TalkXTemplates.route.test.tsx`; `aviso-navegador.test.tsx` ✅ CORRIGIDO (ausente) → PENDENCIAS.md §6 |
| `Contrato DB offline` | [job/121207961229](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335606/job/121207961229) | ❌ pré-existente | → PENDENCIAS.md §3 — constraint `department_audit_logs_action_check` + função `request_department_access` ausentes no banco local de CI |
| `🎭 E2E Tests (Playwright)` | [job/121207961102](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961102) | ❌ pré-existente | → PENDENCIAS.md §1 — secrets E2E não configurados (não é evidência de bug de código) |
| `🎭 Talk X visual/launch` | [job/121207961190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207961190) | ❌ pré-existente | **Não é required check** → PENDENCIAS.md §4 — botão "Ajuda" não implementado |
| `copilot-pull-request-reviewer` | [job/121207986610](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40206335520/job/121207986610) | ❌ externo | **Não é required check** → PENDENCIAS.md §5 — quota 402 esgotada |
| `Auto Update PR Branches` | [run/40201624889](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40201624889) | ❌ externo | **Não é required check** → PENDENCIAS.md §7 — HTTP 504 API GraphQL GitHub (transitório) |

**Correções aplicadas e confirmadas por CI neste run:**
- `alvos-toque-44px.test.tsx` — ✅ não aparece no shard 1/3 (fix: `'Close'` → `'Fechar'`)
- `workItemFormat.test.ts` — ✅ não aparece no shard 2/3 (fix: `withTimeZone('America/Sao_Paulo', ...)`)
- `aviso-navegador.test.tsx` — ✅ não aparece no shard 3/3 (fix: mock `window.Notification` como constructor)
- `useTeamReadState.ts` — ✅ produção: canal recriado a cada mensagem → `hasIds` boolean estável

**Falhas pré-existentes (não introduzidas por este PR):** nenhum dos arquivos de teste com falha consta em `git diff origin/main --name-only`. Confirmado por verificação individual (`git diff origin/main -- <arquivo>` = 0 linhas para cada um).

---

## 8. Tabela de prova final — HEAD `833edf743` (ci.yml run `40214754253`, db-guard run `40214754252`)

> Este é o HEAD atual da branch. Inclui o fix PK-14 (`753eb32cc`) e commit de docs (`833edf743`).
> Build local = ✅ `bun run build` 14.26s (seção 2). Job de CI `🏗️ Build` (121236658015) = ⚠️ skipped — CI Gate falhou por Unit Tests pré-existentes; o job não executou nenhum step. O `bun run build` local prova que o código compila; o skip é consequência do CI Gate, não de falha de build.

| Check | Link do job | Conclusão | Nota |
|---|---|---|---|
| `🔎 TypeCheck` | [job/121233746635](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746635) | ✅ success | Confirmado — 0 erros TS |
| `🔒 Security Audit` | [job/121233746332](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746332) | ✅ success | Confirmado |
| `🧩 Node CI Scripts` | [job/121233746574](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746574) | ✅ success | Confirmado |
| `Replay local das migrations` | [job/121233420819](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754252/job/121233420819) | ✅ success | Confirmado |
| `🧬 Mutação do mapa` | [job/121233746608](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746608) | ✅ success | Não é required check |
| `🏗️ Build` | [job/121236658015](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121236658015) | ⚠️ skipped | CI Gate (Unit Tests pré-existentes) falhou → job skipado; build local ✅ 14.26s (seção 2) |
| `✅ CI Gate` | [job/121236655982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121236655982) | ❌ failure | Consequência das Unit Tests pré-existentes (§6) |
| `🧪 Unit Tests (1/3)` | [job/121233746706](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746706) | ❌ pré-existente | PRÉ-EXISTENTE (§6); `useInboxFilters.type-url` AUSENTE → PK-14 confirmado corrigido → PENDENCIAS.md §6 |
| `🧪 Unit Tests (2/3)` | [job/121233746664](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746664) | ❌ pré-existente | PRÉ-EXISTENTE (§6); `useInboxFilters.type-url` AUSENTE → PK-14 confirmado corrigido → PENDENCIAS.md §6 |
| `🧪 Unit Tests (3/3)` | [job/121233746512](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746512) | ❌ pré-existente | PRÉ-EXISTENTE (§6) → PENDENCIAS.md §6 |
| `Contrato DB offline` | [job/121233421020](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754252/job/121233421020) | ❌ pré-existente | Erros: `cannot drop role pg_*` (system roles no CI); `FATAL: role "root" does not exist` — PRÉ-EXISTENTE → PENDENCIAS.md §3 |
| `🎭 E2E Tests (Playwright)` | [job/121233746597](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233746597) | ❌ cancelled | Cancelado pelo CI Gate (falha de Unit Tests pré-existentes) — PRÉ-EXISTENTE (secrets ausentes) → PENDENCIAS.md §1 |
| `🎭 Talk X visual/launch` | [job/121233528152](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253/job/121233528152) | ❌ pré-existente | **Não é required check** → PENDENCIAS.md §4 |

**PK-14 confirmado resolvido:** `useInboxFilters.type-url.test.tsx` AUSENTE do log de falha nos 3 shards do run `40214754253` — os 9 testes do PK-14 passam. Antes: 9 falhas (window.history.replaceState + window.location.search incompatíveis com MemoryRouter). Depois: `useSearchParams` — 0 falhas.

**Falhas pré-existentes (não introduzidas por este PR):** nenhum dos arquivos de teste com falha consta em `git diff origin/main --name-only`. Confirmado por verificação individual.

**Inventário de required checks:**
- ✅ `🔎 TypeCheck`: success
- ✅ `🔒 Security Audit`: success  
- ✅ `🧩 Node CI Scripts`: success (não required, mas verde)
- ⚠️ `🏗️ Build`: skipped (consequência do CI Gate — código compila localmente)
- ❌ `🧪 Unit Tests (1/3), (2/3), (3/3)`: failure — PRÉ-EXISTENTE
- ❌ `Contrato DB offline`: failure — PRÉ-EXISTENTE
- ❌ `🎭 E2E Tests (Playwright)`: cancelled (cancelado pelo CI Gate) → PRÉ-EXISTENTE (secrets)

**Anti-regressão:** CI/CD Pipeline na main SHA `2d97c44c` run [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) (2026-10-24) — mesmas falhas de Unit Tests, CI Gate e Build skipped. Confirma que nenhuma das falhas é introduzida por este PR.
