# Relatório de Análise — PRs Abertas (2026-10-23)

**Sessão:** `claude/fix-z017-z020-auth-cors-261018-1950`  
**Gerado em:** 2026-10-23T20:30Z · **Atualizado:** 2026-10-24T00:00Z  
**Total de PRs abertas:** 128  
**SHA main inicial:** `17976eb8b877809ba089660f1fb5b86835573c2d`  
**CI main:** RED (Unit Tests 4 testes falham; TypeCheck ✅)  
**Merges realizados:** 5 (#2192, #2061, #2205, #2210, #2204)

---

## Contagem por Veredito

| Veredito | Qtd |
|---|---|
| **MERGEADA** | 5 |
| **BEHIND_BLOQUEADA** | 40 |
| **CONFLITO** | 35 |
| **DRAFT** | 29 |
| **MUST_NOT_MERGE** | 3 |
| **TOCA_WORKFLOWS** | 12 |
| **FECHADA_SEM_MERGE** | 3 |
| **SKIP_SELF** | 1 |
| **Total** | **128** |

---

## Merges realizados (5)

| PR | Título | SHA squash | Timestamp |
|---|---|---|---|
| **#2192** | fix: guarda de vigência do teste RLS do Dashboard | `bac62ba98454811c3bfd117b838af926b1e795b2` | 2026-10-23T20:15Z |
| **#2061** | squash-merge PR #2061 | `af9d36e55a3bef972bcb509bbfb9072d70f7c970` | 2026-10-23T20:45Z |
| **#2205** | feat: Auto-merge test | `98f57abc0924eea128c4cfd467a91953149da829` | 2026-10-23T21:00Z |
| **#2210** | feat: recriar auto-update-pr-branch.yml | `17976eb8b877809ba089660f1fb5b86835573c2d` | 2026-10-23T23:30Z |
| **#2204** | docs: FASE2_ANALISE_TOP30.md | `437a0013b65a8926bc95b8e2708782dd7fcac9d3` | 2026-10-23T22:50Z |

---

## BEHIND_BLOQUEADA (40 PRs)

PRs com `mergeStateStatus=BEHIND` + `strict=true`. Aguardando `auto-update-pr-branch.yml` processar a fila:

`#2005, #2057, #2062, #2064, #2065, #2066, #2067, #2068, #2069, #2070, #2073, #2075, #2076, #2077, #2079, #2081, #2082, #2083, #2084, #2085, #2086, #2087, #2089, #2090, #2097, #2102, #2107, #2119, #2120, #2121, #2127, #2141, #2146, #2148, #2149, #2152, #2186, #2191, #2208, #2209`

---

## CONFLITO (35 PRs)

PRs com `mergeStateStatus=DIRTY`. Resolução manual necessária:

`#1930, #1975, #2040, #2042, #2051, #2056, #2058, #2059, #2060, #2063, #2071, #2072, #2074, #2080, #2088, #2091, #2098, #2104, #2105, #2109, #2110, #2111, #2112, #2124, #2129, #2139, #2142, #2143, #2144, #2145, #2147, #2151, #2155, #2185, #2187`

---

## DRAFT (29 PRs)

Rascunhos — não mergeáveis até o autor marcar como pronta:

`#1991, #1997, #1998, #2000, #2002, #2003, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032, #2034, #2035, #2036, #2037, #2054, #2092, #2093, #2100, #2108, #2113, #2116, #2138, #2199, #2200, #2206`

---

## MUST_NOT_MERGE (3 PRs)

| PR | Motivo |
|---|---|
| **#2078** | Seta `strict: false` — viola E15(b) permanentemente |
| **#2135** | `DROP POLICY IF EXISTS` em migration — DDL destrutivo |
| **#2137** | `DROP POLICY IF EXISTS` em migration — DDL destrutivo |

---

## TOCA_WORKFLOWS (12 PRs)

Modificam `.github/workflows/` — excluídas do batch:

`#1979, #2044, #2046, #2123, #2125, #2126, #2128, #2190, #2195, #2196, #2197, #2207`

---

## FECHADA_SEM_MERGE (3 PRs)

`#1922, #2193, #2198` — fechadas sem merge (substituídas por novas PRs ou abandonadas).

---

## SKIP_SELF (1 PR)

`#2095` — branch desta sessão.

---

## Required Checks da Branch Protection (API)

Apenas **2** checks são required na `main`:

| Check | Condição para merge |
|---|---|
| `🏗️ Build` | `skipped` ou `success` |
| `🔎 TypeCheck` | `success` |

Os demais (Unit Tests, E2E, Contrato DB offline, Security Audit) não bloqueiam merge.

---

## Falhas pré-existentes no main (baseline)

| Arquivo | Teste |
|---|---|
| `FilesTab.fase6.test.tsx` | `com 959 px e preferência 8...` |
| `FilesTab.fase6.test.tsx` | `com 1474 px abre lado a lado...` |
| `ChatMessagesArea.movimento-reduzido.test.tsx` | linha 122 `waitFor bubble` |
| `ChatMessagesArea.loop.test.tsx` | `suporta troca da lista de mensagens sem loop` |

Fonte: `analise-prs/baseline/ci-baseline.md`
