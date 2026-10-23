# Relatório de Análise — PRs Abertas (2026-10-23)

**Sessão:** `claude/fix-z017-z020-auth-cors-261018-1950`  
**Gerado em:** 2026-10-23T20:30Z  
**Total de PRs abertas:** 119  
**SHA main:** `328a475ca75b421664edacfda79a598e01c77e64`  
**CI main:** RED (Unit Tests 3 shards falham + Contrato DB offline; TypeCheck ✅ Security ✅)  
**Merges realizados:** 0 (bloqueio estrutural — ver seção "Por que 0 merges")

---

## Vereditos Finais por PR

| Veredito | Qtd | PRs |
|---|---|---|
| **BEHIND_BLOQUEADA** | 45 | `#2005, #2057, #2061, #2062, #2064, #2065, #2066, #2067, #2068, #2069, #2070, #2073, #2075, #2076, #2077, #2079, #2081, #2082, #2083, #2084, #2085, #2086, #2087, #2089, #2090, #2097, #2102, #2107, #2119, #2120, #2121, #2127, #2135, #2137, #2141, #2146, #2148, #2149, #2152, #2186, #2187, #2191, #2192, #2193, #2196` |
| **CONFLITO** | 36 | `#1922, #1930, #1975, #2040, #2042, #2044, #2051, #2056, #2058, #2059, #2060, #2063, #2071, #2072, #2074, #2080, #2088, #2091, #2098, #2104, #2105, #2109, #2110, #2111, #2112, #2124, #2129, #2139, #2142, #2143, #2144, #2145, #2147, #2151, #2155, #2185` |
| **DRAFT** | 28 | `#1991, #1997, #1998, #2000, #2002, #2003, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032, #2034, #2035, #2036, #2037, #2054, #2092, #2093, #2100, #2108, #2113, #2116, #2138, #2195, #2198` |
| **DESCARTADA** | 9 | `#2078` (strict=false — viola E15(b)) + `#2190, #2197, #1979, #2046, #2123, #2125, #2126, #2128` (tocam `.github/workflows/`) |
| **SKIP_SELF** | 1 | `#2095` (branch desta sessão) |
| **MERGEADA** | 0 | — |
| **Total** | **119** | |

---

## Por que 0 merges foram realizados

### Bloqueio estrutural

1. **strict=true** na branch protection: qualquer PR BEHIND precisa ser atualizada para o HEAD do main antes do merge.  
2. **`github_update_pr_branch` não está autorizado** nesta sessão (única escrita permitida: `github_merge_pull_request`).  
3. Portanto, as 45 PRs BEHIND_BLOQUEADA **não podem ser mescladas** sem antes atualizar a branch — o GitHub retornaria erro `405 Expected` ou `merge conflict`.

### Testes que falham na main (nomes exatos)

| Arquivo | Teste | Tipo de falha |
|---|---|---|
| `FilesTab.fase6.test.tsx` | "com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid" | grid-cols-4 em vez de grid-cols-5 |
| `FilesTab.fase6.test.tsx` | "com 1474 px abre lado a lado (260 px) e o grid cai de 8 para 6" | grid-cols-4 em vez de grid-cols-8 |
| `ChatMessagesArea.movimento-reduzido.test.tsx` | linha 122 | `[data-testid="bubble"]` não encontrado |
| `ChatMessagesArea.loop.test.tsx` | "suporta troca da lista de mensagens (nova mensagem chega) sem loop" | `[data-testid="bubble"]` não encontrado |

**Contrato DB offline:** falha no step "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)" — `DROP ROLE IF EXISTS pg_monitor` etc. tenta dropar roles de sistema do Postgres 17 (não é regressão de código).

### Required checks reais (API branch protection)

| Check | Obrigatório pela API |
|---|---|
| `🏗️ Build` | ✅ SIM (skipped = OK) |
| `🔎 TypeCheck` | ✅ SIM (success) |
| `🧪 Unit Tests` | ❌ NÃO (roda mas não bloqueia merge) |
| `🔒 Security Audit` | ❌ NÃO |
| `Contrato DB offline` | ❌ NÃO |
| `🎭 E2E Tests` | ❌ NÃO |

TypeCheck passa na main → as 45 BEHIND PRs, após update, provavelmente teriam TypeCheck ✅ e poderiam ser mergeadas. Mas o update não é operação autorizada nesta sessão.

---

---

## Resumo por Veredito (FINAL)

| Veredito | Quantidade | Descrição |
|---|---|---|
| **BEHIND_BLOQUEADA** | 45 | BEHIND + sem conflito + sem workflows — merge impossível sem `update_pr_branch` (não autorizado nesta sessão) |
| **CONFLITO** | 36 | DIRTY — conflito de merge com main; requer resolução manual |
| **DRAFT** | 28 | Rascunho — autor não sinalizou como pronta |
| **DESCARTADA** | 9 | 8 tocam `.github/workflows/` (proibido pelo goal) + #2078 (reverte strict=false, viola E15(b)) |
| **SKIP_SELF** | 1 | #2095 — branch desta sessão |
| **MERGEADA** | 0 | Nenhuma PR mergeada (bloqueio estrutural — ver análise) |
| **Total** | **119** | |

---

## Required Checks da Branch Protection (API)

A API do GitHub enforça apenas **2** required checks na `main`:

| Check | Condição para merge |
|---|---|
| `🏗️ Build` | `skipped` ou `success` (skipped = OK para PRs sem TypeScript) |
| `🔎 TypeCheck` | `success` |

Os demais checks (Unit Tests, E2E, Contrato DB offline, Security Audit) rodam mas **não bloqueiam** merge — falham no main também por causas pré-existentes.

---

## MERGE_CANDIDATO (45 PRs)

PRs que podem ser squash-mergeadas após update do branch + CI verde nos 2 required checks:

`#2005, #2057, #2061, #2062, #2064, #2065, #2066, #2067, #2068, #2069, #2070, #2073, #2075, #2076, #2077, #2079, #2081, #2082, #2083, #2084, #2085, #2086, #2087, #2089, #2090, #2097, #2102, #2107, #2119, #2120, #2121, #2127, #2135, #2137, #2141, #2146, #2148, #2149, #2152, #2186, #2187, #2191, #2192, #2193, #2196`

---

## BLOCKED_CONFLICT (36 PRs)

Conflito de merge com main (DIRTY). Resolução manual necessária:

`#1922, #1930, #1975, #2040, #2042, #2044, #2051, #2056, #2058, #2059, #2060, #2063, #2071, #2072, #2074, #2080, #2088, #2091, #2098, #2104, #2105, #2109, #2110, #2111, #2112, #2124, #2129, #2139, #2142, #2143, #2144, #2145, #2147, #2151, #2155, #2185`

---

## SKIP_DRAFT (28 PRs)

Rascunhos — não mergeáveis até o autor marcar como pronta:

`#1991, #1997, #1998, #2000, #2002, #2003, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032, #2034, #2035, #2036, #2037, #2054, #2092, #2093, #2100, #2108, #2113, #2116, #2138, #2195, #2198`

---

## TOCA_WORKFLOWS (8 PRs)

Modificam `.github/workflows/` — excluídas do batch por regra de negócio:

`#1979, #2046, #2123, #2125, #2126, #2128, #2190, #2197`

---

## MUST_NOT_MERGE (1 PR)

| PR | Motivo |
|---|---|
| **#2078** `ci(F3): baseline strict=false` | Seta `strict: false` em `scripts/ci/github-settings-baseline.json`, revertendo a política canônica `strict=true` revogada permanentemente em E15(b) (02/10/2026, CLAUDE.md). Mergear quebra o perímetro de segurança do GitHub. |

---

## SKIP_SELF (1 PR)

| PR | Branch |
|---|---|
| **#2095** | `claude/fix-z017-z020-auth-cors-261018-1950` — branch desta sessão de análise |

---

## Merges Realizados

*(Atualizado em tempo real — ver `progresso.json`)*

| PR | SHA squash | Timestamp |
|---|---|---|
| — | — | — |

---

## Arquivos Gerados

| Arquivo | Descrição |
|---|---|
| `analise-prs/prs.json` | 119 PRs com metadados completos |
| `analise-prs/prs.csv` | CSV para análise tabular |
| `analise-prs/baseline/ci-baseline.md` | Estado do CI do main no início da análise |
| `analise-prs/regras-de-negocio.md` | Regras aplicadas na classificação |
| `analise-prs/progresso.json` | Estado atual (vereditos + merges) |
| `analise-prs/dossies/PR-<n>.md` | Dossiê individual de cada PR (119 arquivos) |
| `analise-prs/RELATORIO_PRS.md` | Este arquivo |
