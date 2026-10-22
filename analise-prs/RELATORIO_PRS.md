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
| BLOQUEADOS (não podem ser mergeados por regra) | **26** |
| AGUARDAR_CI (podem ser mergeados quando CI voltar ao verde) | **4** |
| PRs que tocam `.github/workflows/` | **26 (87%)** |

**Nenhum merge foi executado.** Todos os 4 candidatos válidos têm os mesmos 4 required checks falhando que já falham no HEAD da `main` — a falha é pré-existente, não introduzida pelos PRs.

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

**A main está com 4 required checks vermelhos.** Enquanto isso, nenhum PR pode ser mergeado via branch protection (`strict=true`).

---

## PRs AGUARDAR_CI (4)

Esses PRs são válidos e podem ser mergeados assim que os required checks da main voltarem ao verde.

### #2149 — docs(reconciliation): P053
**Branch:** `claude/docs-p053-regressao-261021-0827`
- Tipo: Documentação pura (ledger de reconciliação)
- Base atualizada: ✅
- Regressão nova: ✅ Nenhuma
- Ação: Mergear quando CI da main estiver verde

### #2152 — test(e2e): spec de toque 44px
**Branch:** `claude/test-toque44-seletores-261021-0853`
- Tipo: Fix de teste E2E (seletor `'Close'` → `'Fechar'`, mocks de bootstrap)
- Base atualizada: ✅
- Regressão nova: ✅ Nenhuma
- Ação: Mergear quando CI da main estiver verde

### #2185 — docs(pendencias): §8 + §9
**Branch:** `claude/kind-gates-87mwoe`
- Tipo: Mix de documentação + testes + source hooks
- Base atualizada: ❌ (BEHIND main — `61a973d` vs `5a4632c`)
- Regressão nova: Não verificável (PR desatualizado)
- Ação: Update da branch + aguardar CI verde; verificar se `Talk X visual` e `Mutação do mapa` passam após update

### #2186 — fix(security): auditoria Supabase
**Branch:** `claude/loving-lovelace-esc3l2`
- Tipo: Documentação de auditoria de segurança (propostas SQL — NÃO aplicadas)
- Base atualizada: ✅
- Regressão nova: ✅ Nenhuma
- Ação: Mergear quando CI da main estiver verde

---

## PRs BLOQUEADOS (26)

Todos por uma única razão: **tocam `.github/workflows/`**.

### Série "Add workflow X" (adicionam workflows de outras linguagens — irrelevantes para este projeto)
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

---

## Recomendação

1. **Corrigir a main primeiro:** investigar por que `🧪 Unit Tests` e `Contrato DB offline` estão falhando no HEAD. Enquanto isso não for resolvido, nenhum PR pode entrar.

2. **Limpar a série de workflows genéricos (#2157–#2181):** esses 21 PRs adicionam workflows de Python, R, Rust, PHP, Java, Deno, Docker etc. — tecnologias que não existem neste projeto TypeScript/React. São "workflows de template" sem valor e deveriam ser fechados. Se #2183 (que os remove) for considerado necessário, deve ser discutido com o Joaquim fora desta sessão.

3. **Mergear os 4 candidatos após CI verde:** ordem sugerida por risco crescente:
   - #2149 (docs) → mais seguro
   - #2186 (audit docs) → seguro
   - #2152 (e2e fix) → baixo risco
   - #2185 (tests + source, BEHIND) → atualizar branch primeiro

---

## Baseline registrado

| Ferramenta | Estado no container |
|---|---|
| `vite build` | ❌ `vite: command not found` (exit 127) |
| `vitest run` | ❌ `vitest: command not found` (exit 127) |
| `eslint .` | ❌ `Cannot find package '@eslint/js'` (exit 1) |
| `tsc -b --force` | ❌ múltiplos erros (exit 1) |

O container não tem `bun install` executado — todas as ferramentas locais falham. A baseline foi gravada em `analise-prs/baseline/`. Regressão = falha **nova** que não existe na baseline ou no HEAD da main.
