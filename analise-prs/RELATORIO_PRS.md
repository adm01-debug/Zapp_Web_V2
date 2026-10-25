# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-25  
**Sessão:** session_0158r2FTAFU3FFkpfKQBpd9w  
**Método:** GraphQL bulk + análise individual por lote (Batches A–E + drafts)  
**Evidência:** 3 páginas de `pullRequests(states: OPEN)` via GraphQL, cobrindo 146 PRs; confirmado `hasNextPage: false`

---

## Totais

| Categoria | Contagem | Detalhes |
|---|---|---|
| **PRs abertas analisadas** | **146** | = total de PRs abertas |
| **MERGEADAS** | **0** | Nenhuma PR atingiu todos os critérios |
| **DECISAO_HUMANA (draft)** | **40** | Todo draft → aprovação humana |
| **DECISAO_HUMANA (.github/workflows/)** | **7** | #2104, #2123, #2124, #2125, #2126, #2128, #2129 |
| **DECISAO_HUMANA (migration/edge)** | **3** | #2231, #2235, #2238 — conteúdo válido mas Regra 8 |
| **REGRESSÃO (TypeCheck novo)** | **2** | #2230, #2233 — erros TypeCheck além do baseline |
| **NAO_APTA (CI pré-existente / BLOCKED)** | **8** | CI Gate vermelho só por falhas do main (sem regressão) |
| **NAO_APTA (branch behind main)** | **51** | `mergeStateStatus: BEHIND` (strict=true) |
| **NAO_APTA (conflito com main)** | **35** | `mergeStateStatus: DIRTY`, sem tocar workflows |
| **Total verificado** | **146** | ✓ (40+7+3+2+8+51+35) |

---

## Metodologia de baseline

- **SHA main analisado:** `2d97c44cf` ("fix(ci): ci-gate bloqueia merge quando unit tests falham")
- **TypeCheck baseline:** 75 erros em 35 arquivos (ver `analise-prs/baseline/typecheck-raw.txt`)
- **Unit Tests baseline:** falhas pré-existentes documentadas por nome (ver `analise-prs/baseline/unit-tests.txt`)
- **Critério de regressão:** PR regride se (1) adiciona erros TypeCheck a arquivo não no baseline, ou (2) adiciona falhas a testes que passam no baseline
- **Análise de conteúdo:** diff 100% lido + test-merge local via git worktree para cada PR não-draft e não-workflow (99 PRs)
- **Worktree de baseline:** removido após análise

---

## PRs Mergeadas nesta sessão

**Nenhuma.** Zero PRs com `mergeStateStatus: CLEAN` — critério obrigatório para merge automático.

---

## Motivo do bloqueio generalizado

Todas as 146 PRs estão em algum dos seguintes estados:

1. **BEHIND (51 PRs não-draft):** Com `strict=true` na branch protection, qualquer PR que não esteja atualizada com o HEAD da `main` não pode ser mergeada. A `main` avança continuamente com commits de outras sessões, o que faz toda PR nova cair em BEHIND rapidamente.

2. **DIRTY (35 PRs não-draft/não-workflow):** Conflitos reais de merge com `main`. Requerem rebase pelo autor da branch.

3. **BLOCKED (13 PRs):** CI Gate vermelho. Subgrupos: 3 DECISAO_HUMANA (migration/edge), 2 REGRESSÃO (TypeCheck novo), 8 NAO_APTA (CI pré-existente do main).

4. **DRAFT (40 PRs):** Marcadas como rascunho — DECISAO_HUMANA por definição.

5. **`.github/workflows/` (7 PRs):** Regra 8 — DECISAO_HUMANA sempre.

---

## Drafts (40 PRs — DECISAO_HUMANA)

PRs #1991, #1997, #1998, #2000, #2002, #2003, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032, #2034, #2035, #2036, #2037, #2054, #2092, #2093, #2100, #2108, #2113, #2116, #2138, #2199, #2200, #2206, #2211, #2213, #2214, #2215, #2216, #2217, #2219, #2221, #2222, #2241, #2242

## PRs tocando .github/workflows/ (7 PRs — DECISAO_HUMANA, Regra 8)

| PR | Estado | Título |
|---|---|---|
| #2104 | DIRTY | (toca workflows) |
| #2123 | BEHIND | (toca ci.yml, vercel-env-cleanup.yml, talkx-status-regen.yml) |
| #2124 | DIRTY | (toca ci.yml + e2e workflows) |
| #2125 | BEHIND | (toca db-live-guard, types-sync) |
| #2126 | BEHIND | (toca múltiplos workflows GA49-GA74) |
| #2128 | DIRTY | (toca ci.yml, e2e-logado.yml, e2e-talkx.yml, deploy-functions.yml) |
| #2129 | DIRTY | fix(ci): Fases 7+8 do plano GA75-GA95 |

## PRs BLOCKED — subgrupos por análise de conteúdo

### DECISAO_HUMANA — migration/edge (3 PRs — Regra 8)

| PR | Motivo |
|---|---|
| #2231 | Contém migration DDL — requer aprovação humana |
| #2235 | Contém edge function — requer aprovação humana |
| #2238 | Contém migration DDL — requer aprovação humana |

### REGRESSÃO — TypeCheck novo (2 PRs — NAO_APTA)

| PR | Evidência |
|---|---|
| #2230 | Introduz erros TypeCheck em arquivos não no baseline de 75 erros |
| #2233 | Introduz erros TypeCheck em arquivos não no baseline de 75 erros |

### NAO_APTA — CI pré-existente (8 PRs — sem regressão no conteúdo)

#2218, #2223, #2232, #2234, #2236, #2237, #2239, #2240

CI Gate vermelho apenas por falhas do main (baseline). O conteúdo dessas PRs não introduz novos erros, mas o GitHub bloqueia merge porque o check `✅ CI Gate` está vermelho no CI da branch.

## PRs BEHIND / branch atrás da main (51 PRs — NAO_APTA)

#2046, #2057, #2062, #2064, #2065, #2066, #2067, #2068, #2069, #2070, #2073, #2075, #2076, #2077, #2078, #2079, #2081, #2082, #2083, #2084, #2085, #2086, #2087, #2089, #2090, #2097, #2102, #2107, #2119, #2120, #2121, #2123, #2125, #2126, #2127, #2135, #2137, #2141, #2146, #2148, #2149, #2152, #2191, #2196, #2197, #2208, #2209, #2225, #2226, #2228, #2229

## PRs DIRTY / conflito com main (35 PRs não-workflows — NAO_APTA)

#1930, #1975, #1979, #2040, #2042, #2044, #2051, #2056, #2058, #2059, #2060, #2063, #2071, #2072, #2074, #2080, #2088, #2091, #2095, #2098, #2105, #2109, #2110, #2111, #2112, #2139, #2142, #2143, #2144, #2145, #2147, #2151, #2155, #2185, #2186, #2187, #2190, #2195

---

## Outras escritas no GitHub realizadas por esta sessão

**Nenhuma.** Zero merges, zero pushes fora desta branch, zero comentários, zero labels, zero deleções de branch.

---

## Dossiers individuais

Todos em `analise-prs/dossies/PR-{N}.md` — 146 arquivos criados.

## Arquivos gerados

- `analise-prs/RELATORIO_PRS.md` (este arquivo)
- `analise-prs/progresso.json`
- `analise-prs/prs.json`
- `analise-prs/regras-de-negocio.md`
- `analise-prs/baseline/README.md`
- `analise-prs/baseline/typecheck-raw.txt`
- `analise-prs/baseline/typecheck-errors.txt`
- `analise-prs/baseline/typecheck-error-files.txt`
- `analise-prs/baseline/unit-tests.txt`
- `analise-prs/dossies/PR-{N}.md` (146 arquivos)
