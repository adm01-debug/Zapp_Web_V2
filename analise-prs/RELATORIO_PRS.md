# Relatório de Análise — 30 PRs Abertos
**Data:** 2026-10-22
**Repositório:** `adm01-debug/Zapp_Web_V2`
**Analisado por:** Claude Code (sessão `session_01MEWTDAcLtXFjFH9scZXviY`)

---

## Resumo Executivo

| | |
|---|---|
| Total de PRs analisados | **30** |
| Mergeados nesta sessão | **0** |
| BLOQUEADOS (não podem ser mergeados por regra) | **30** |
| AGUARDAR_CI | **0** |
| PRs que tocam `.github/workflows/` | **30 (100%)** |

**Nenhum merge foi executado.** Todos os 30 PRs tocam `.github/workflows/`, o que os bloqueia automaticamente pela regra de negócio da sessão.

### Correção em relação ao relatório anterior

O relatório anterior (mesma data) classificou 4 PRs como AGUARDAR_CI sem verificar os arquivos reais tocados pelo diff de cada branch. Após `git fetch` e `git diff --name-only main..<branch>` para todos os 4 candidatos:

| PR | Branch | Workflows tocados |
|---|---|---|
| #2149 | `claude/docs-p053-regressao-261021-0827` | 13 arquivos em `.github/workflows/` |
| #2152 | `claude/test-toque44-seletores-261021-0853` | 13 arquivos em `.github/workflows/` |
| #2185 | `claude/kind-gates-87mwoe` | `eslint.yml`, `static.yml` |
| #2186 | `claude/loving-lovelace-esc3l2` | `eslint.yml`, `static.yml` |

Todos os 4 são **BLOQUEADOS** pela regra: _"Toca `.github/workflows/`: qualquer PR que adicione, remova ou modifique arquivos em `.github/workflows/` é **BLOQUEADO** automaticamente, independente do conteúdo."_

---

## Situação da main

**HEAD:** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`

| Required Check | Status no HEAD |
|---|---|
| 🔍 Lint & TypeCheck | ✅ |
| 🧪 Unit Tests (1/3) | ❌ FALHA |
| 🧪 Unit Tests (2/3) | ❌ FALHA |
| 🧪 Unit Tests (3/3) | ❌ FALHA |
| 🏗️ Build | ✅ |
| 🔒 Security Audit | ✅ |
| Contrato DB offline | ❌ FALHA |
| 🎭 E2E Tests (Playwright) | ❌ |

**A main está com 4 required checks vermelhos.** Com `strict=true`, qualquer PR BEHIND a main retorna "not up to date" no merge.

---

## Falhas pré-existentes identificadas por nome

Executado `bun run test` localmente no HEAD `5a4632c` (confirmado também pelos logs de CI):

| Arquivo de teste | Falhas |
|---|---|
| `useInboxBulkActions.test.ts` | 2 |
| `useGoalsDashboard.test.tsx` | 4 |
| `useTalkXSegments.test.ts` | 6 |
| `outbound-message.service.test.ts` | 1 |
| `contrasteAA.test.tsx` | 4 |
| `useChatMediaSending.audio-meme-falha.test.ts` | 3 |
| `AuditLogDashboard.test.tsx` | 9 |
| `fundacaoVisual.test.tsx` | 2 |
| `ChatPopup.pagination.test.tsx` | 1 |
| `TalkXOverview.states.test.tsx` | 1 |
| `TalkXA11yNomePapel.test.tsx` | 3 |
| `adminDownloadPermission.test.ts` | 5 |
| `ChatMessagesArea.agrupar-envio.test.tsx` (CI shard 1) | 4 |
| `ChatMessagesArea.movimento-reduzido.test.tsx` (CI shard 1) | 1 |
| `FilesTab.fase6.test.tsx` (CI shard 1) | 2 |

Lista completa em `analise-prs/baseline/tests.txt`.

---

## Test Merges Executados

Todos os 4 candidatos foram testados com `git merge --no-commit --no-ff`:

| PR | Resultado | Conflitos |
|---|---|---|
| #2149 | exit 0 — sem conflitos | nenhum |
| #2152 | exit 0 — sem conflitos | nenhum |
| #2185 | exit 0 — sem conflitos | nenhum |
| #2186 | exit 0 — sem conflitos | nenhum |

Apesar de não haver conflitos técnicos, todos são **BLOQUEADOS** por tocar `.github/workflows/`.

---

## Todos os PRs BLOQUEADOS (30)

### Série "Add workflow X" (adicionam workflows de outras linguagens)
| PR | Título |
|---|---|
| #2157 | Add Dependency Review Action workflow |
| #2159 | Add Bearer workflow for code scanning |
| #2160 | Add Hadolint workflow for Dockerfile linting |
| #2161 | Add puppet-lint GitHub Actions workflow |
| #2162 | Add PHPMD workflow for PHP code analysis |
| #2163 | Add lintr workflow for R code analysis |
| #2164 | Add GitHub Actions workflow for rust-clippy analysis |
| #2165 | Add PMD code scanning workflow |
| #2166 | Add GitHub Actions workflow for Deno |
| #2167 | Add GitHub Actions workflow for Node.js with Webpack |
| #2168 | Add SLSA generic generator workflow |
| #2169 | Add Node.js CI workflow for testing |
| #2170 | Add GitHub Actions workflow for npm package publishing |
| #2171 | Add Docker publish workflow configuration |
| #2172 | Add Docker Image CI workflow |
| #2173 | Add GitHub Actions workflow for npm publishing |
| #2174 | Add GitHub Actions workflow for Python package publishing |
| #2175 | Add GitHub Actions workflow for Python package with Conda |
| #2176 | Add Django CI workflow for testing on multiple Python versions |
| #2177 | Add GitHub Actions workflow for Python package |
| #2178 | Add GitHub Super Linter workflow |
| #2179 | Add manual workflow for greeting |
| #2181 | Create nextjs.yml |

### Série "fix/chore CI" (modificam workflows existentes)
| PR | Título |
|---|---|
| #2151 | fix(ci): destravar workflows que falhavam antes de executar |
| #2155 | fix(ci): destrava workflows que falhavam antes de executar |
| #2183 | chore(ci): remove workflows alienígenas eslint.yml e static.yml |

### Candidatos reclassificados como BLOQUEADOS (tocam `.github/workflows/`)
| PR | Título | Workflows tocados |
|---|---|---|
| #2149 | docs(reconciliation): P053 | 13 (ci.yml, codeql.yml, db-guard.yml, ...) |
| #2152 | test(e2e): spec de toque 44px | 13 (mesma lista) |
| #2185 | docs(pendencias): §8 + §9 | eslint.yml, static.yml |
| #2186 | fix(security): auditoria Supabase | eslint.yml, static.yml |

---

## Recomendação

1. **Corrigir a main primeiro:** as falhas em `🧪 Unit Tests` (12+ arquivos) e `Contrato DB offline` são pré-existentes e listadas em `analise-prs/baseline/tests.txt`. Nenhum PR pode ser mergeado enquanto `strict=true` e a main estiver vermelha.

2. **Investigar por que os PRs legítimos (#2149, #2152, #2185, #2186) incluem modificações de workflows:** esses PRs foram criados por sessões que aparentemente fizeram rebase ou merge contra branches que continham changes nos workflows. As modificações de workflow em #2149/#2152 são idênticas entre si (13 arquivos), sugerindo herança de um ancestor comum.

3. **Limpar a série de workflows genéricos (#2157–#2181):** 21 PRs que adicionam workflows irrelevantes (Python, R, Rust, PHP, Java, Deno, Docker, Node.js) a um projeto TypeScript/React. Deveriam ser fechados.

---

## Baseline registrado

| Ferramenta | Estado após `bun install` |
|---|---|
| `bun run test` | ❌ 44+ falhas em 12 arquivos (pré-existentes no HEAD `5a4632c`) |
| `vite build` | ✅ (CI Build check passa na main) |
| `eslint` + TypeCheck | ✅ (CI Lint & TypeCheck passa na main) |
| Contrato DB offline | ❌ (falha pré-existente na main) |
