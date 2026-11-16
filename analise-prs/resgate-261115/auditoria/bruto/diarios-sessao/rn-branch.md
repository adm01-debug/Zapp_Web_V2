# Regras de Negócio — Análise de PRs (2026-10-24)

Fonte de verdade para classificação de PRs nesta sessão de análise.
SHA do main no início da análise: `17976eb8b877809ba089660f1fb5b86835573c2d`

---

## R1 — MUST_NOT_MERGE (proibido para sempre)

PRs que nunca devem ser mergeadas, independentemente do estado ou da fila.

| PR | Motivo | Fonte |
|---|---|---|
| **#2078** | Seta `strict: false` em `scripts/ci/github-settings-baseline.json`, revertendo política `strict=true` revogada permanentemente em E15(b) (02/10/2026) | CLAUDE.md §Perímetro do GitHub; `analise-prs/dossies/PR-2078.md` |
| **#2135** | Contém `DROP POLICY IF EXISTS` em migration — DDL destrutivo proibido por regra de segurança desta sessão | `analise-prs/dossies/PR-2135.md` |
| **#2137** | Contém `DROP POLICY IF EXISTS` em migration — DDL destrutivo proibido por regra de segurança desta sessão | `analise-prs/dossies/PR-2137.md` |

---

## R2 — TOCA_WORKFLOWS (descartada — não tocar .github/workflows/)

PRs que modificam `.github/workflows/` são excluídas do batch de merge por regra de negócio desta sessão.
Exceção única já consumida: PR #2210 (recriação de `auto-update-pr-branch.yml`) foi mergeada na sessão anterior — disputa registrada pelo stop hook.

PRs nesta categoria: `#1979, #2044, #2046, #2123, #2125, #2126, #2128, #2190, #2195, #2196, #2197, #2207`

Fonte: instrução permanente da sessão — "PRs tocando `.github/workflows/` são DESCARTADA".

---

## R3 — DRAFT (não mergeável até autor marcar como pronta)

PRs em estado draft não podem receber squash-merge. Aguardam ação do autor.
Estado verificado via GraphQL `isDraft` field.

PRs nesta categoria: `#1991, #1997, #1998, #2000, #2002, #2003, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032, #2034, #2035, #2036, #2037, #2054, #2092, #2093, #2100, #2108, #2113, #2116, #2138, #2199, #2200, #2206`

---

## R4 — CONFLITO (DIRTY — conflito de merge com main)

PRs com `mergeStateStatus = DIRTY` têm conflito de merge. Resolução manual necessária por humano ou autor.
Não é responsabilidade desta sessão resolver conflitos — escopo = merge das PRs limpas.

PRs nesta categoria: `#1930, #1975, #2040, #2042, #2051, #2056, #2058, #2059, #2060, #2063, #2071, #2072, #2074, #2080, #2088, #2091, #2098, #2104, #2105, #2109, #2110, #2111, #2112, #2124, #2129, #2139, #2142, #2143, #2144, #2145, #2147, #2151, #2155, #2185, #2187`

Fonte: `analise-prs/dossies/PR-1930.md` (exemplo); GraphQL `mergeStateStatus` field.

---

## R5 — BEHIND_BLOQUEADA (strict=true, aguardando auto-update)

PRs com `mergeStateStatus = BEHIND` não podem ser mergeadas diretamente quando `strict=true` na branch protection.
Exigem que a branch seja atualizada com o HEAD do main antes de tentar o merge.

Mecanismo de desbloqueio: `auto-update-pr-branch.yml` (recriado em PR #2210 — agora ativo).
Este workflow processa PRs com `auto_merge` habilitado, serialmente (FIFO por `enabledAt`), uma por execução.

PRs nesta categoria (50): `#2005, #2044, #2046, #2057, #2062, #2064, #2065, #2066, #2067, #2068, #2069, #2070, #2073, #2075, #2076, #2077, #2079, #2081, #2082, #2083, #2084, #2085, #2086, #2087, #2089, #2090, #2097, #2102, #2107, #2119, #2120, #2121, #2123, #2125, #2126, #2127, #2128, #2141, #2146, #2148, #2149, #2152, #2186, #2190, #2191, #2195, #2196, #2197, #2208, #2209`

Fonte: CLAUDE.md §Perímetro do GitHub (`strict=true`); `RELATORIO_PRS.md` §"Required Checks"; `.github/workflows/auto-update-pr-branch.yml`.

---

## R6 — Critério de regressão

Uma PR introduz regressão se, após merge de teste local no main HEAD, ocorrer qualquer dos seguintes:

1. **TypeCheck:** passa de 0 erros para N>0 erros (`tsc --noEmit` com exit não-zero)
2. **Novos testes quebrando:** falhas em arquivos de teste diferentes dos 3 listados na baseline pré-existente

### Falhas pré-existentes no main (NÃO são regressões)

| Arquivo | Teste |
|---|---|
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | `com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid` |
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | `com 1474 px abre lado a lado (260 px) e o grid cai de 8 para 6` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx` | `waitFor bubble` (linha 122) |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx` | `suporta troca da lista de mensagens (nova mensagem chega) sem loop` |

Fonte: `analise-prs/baseline/ci-baseline.md` (gerado em 2026-10-24).

---

## R7 — Required checks (branch protection via API GitHub)

Apenas **2** checks são required na branch protection da `main`:

| Check | Condição para merge |
|---|---|
| `🏗️ Build` | `skipped` ou `success` (skipped = OK — unit-tests falham → build é pulado via `needs:`) |
| `🔎 TypeCheck` | `success` |

Os demais checks (Unit Tests, E2E, Contrato DB offline, Security Audit) rodam mas **não bloqueiam** merge.
Já falham no main por causas pré-existentes não relacionadas a PRs abertas.

Fonte: `RELATORIO_PRS.md` §"Required Checks da Branch Protection (API)"; verificado via `github_get_branch_protection`.

---

## R8 — Ferramentas de escrita autorizadas

Única ferramenta autorizada para escrita no GitHub: MCP `GITHUB - MCP - FOREVER` (`github_merge_pull_request`, `github_push_files`).
O MCP padrão do GitHub retorna 403 em operações de escrita.

`github_update_pr_branch` é **absolutamente proibido** nesta sessão (instrução permanente).

---

## R9 — SKIP_SELF

PR `#2095` é a branch desta sessão de análise (`claude/fix-z017-z020-auth-cors-261018-1950`). Ignorada.

---

## R10 — Merge squash only

Todos os merges usam squash: `merge_method: "squash"` via `github_merge_pull_request`.
Branch é deletada automaticamente pós-merge (`delete_branch_on_merge=true` no repo).
