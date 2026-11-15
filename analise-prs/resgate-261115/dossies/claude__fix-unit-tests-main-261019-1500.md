# Dossiê — claude/fix-unit-tests-main-261019-1500 (PR #2097)

- Ref: `origin/claude/fix-unit-tests-main-261019-1500` · tip `eec06ea3e` · merge-base `bac62ba98` (2026-10-23)
- Commits: `ced0f5bac fix: corrige falhas pre-existentes nos Unit Tests (useKnowledgeBase + useTalkXSegments)` + merge de main.
- PR #2097: CLOSED sem merge em 2026-11-01 ("branch obsoleta — conteúdo absorvido pela main"). Qodo (2026-10-23) apontou 4 bugs na própria branch (ver abaixo).
- Propósito: fazer 3 testes vermelhos da `main` passarem (`useKnowledgeBase.erro.test.tsx`, `useTalkXSegments.test.ts:130`, `useTalkXSegments.rpcDesacoplada.test.ts`).

## Veredito: INCORPORADA (apagar branch: seguro)

Tudo que a branch queria entregar já está na `main`, implementado de forma igual ou melhor. A única mudança da branch que NÃO está na main é um bug (escape de `|`), rejeitado com razão.

## Arquivo × achado × evidência

| Arquivo / hunk | Achado | Evidência na `origin/main` |
|---|---|---|
| `src/hooks/integrations/useKnowledgeBase.ts` — estado `error` + `setError(null)` no início + `error` no retorno | **JÁ NA MAIN** | linhas 58-61 (`const [error, setError] = useState<string|null>(null)`), 65 (`setError(null)`), 73 (`setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)`), retorno com `error`. Entrou em `e1f2ee4dd fix(test): destrava o CI Gate da main` (2026-10-27) e `0b77f8641 fix(conhecimento): encerra carregamento após falha de rede (#2335)` acrescentou try/catch/finally (linhas 66-78). |
| `useKnowledgeBase.ts` — em erro, `setArticles([]); setFiles([])` (as 2 linhas `removed_still_in_main`: `if (articlesRes.data) setArticles(...)` / `if (filesRes.data) setFiles(...)`) | **OBSOLETA (abordagem pior)** | A main manteve de propósito `if (articlesRes.data) ...` (linhas 71-72): um erro em uma tabela não apaga a lista da outra. Qodo na PR #2097 (achados 2 e 3) marcou exatamente o `clear` da branch como bug ("one failed read hides the other list", "older failed refresh erases new data"). Teste `useKnowledgeBase.erro.test.tsx:50-52,65,78,92-95` passa com a versão da main (arrays partem vazios; erro em `error`). |
| `src/hooks/integrations/useTalkXSegments.ts` — `lead_origin` com `comingSoon: true` | **JÁ NA MAIN** | linha 90 `{ value: 'lead_origin', ..., comingSoon: true }` (com comentário explicando). Teste `useTalkXSegments.test.ts:129-131` espera `['lead_origin','lead_score','risk_score']`. |
| `useTalkXSegments.ts` — `quoted` passa a escapar `\|` (`/[\\"|]/g`) | **OBSOLETA — é BUG, não portar** | O callback devolve `\"` para qualquer char que não seja `\`, então `a|b` vira `"a\"b"` (simulado em node: branch → `"a\"b"`, main → `"a|b"`). Qodo achado 4 ("Pipe characters become quotes in filters"). Main mantém `/[\\"]/g` (linha 199). Nenhum teste da main exige escape de pipe. |
| `useTalkXSegments.ts` — guard `real_sector`/`real_uf` em `ruleToFilter` → `return null` | **JÁ NA MAIN (generalizado)** | linhas 207-209 `if (def.ponteOnly) return null;` com `real_sector`/`real_uf` marcados `ponteOnly: true` (linhas 80-81). Commits `a0e21b651` e `a6fbadfa3 (#2240)`. |
| `useTalkXSegments.ts` — `audienceRulesPayload` lança `Campo X requer pré-resolução via p_contact_ids` | **JÁ NA MAIN (outro lugar)** | função `assertNoPonteOnlyFields` (linhas 280-289, mesma mensagem de erro) chamada em `countAudience` (l.311) e `resolveAudience` (l.333); `audienceRulesPayload` ficou puro (l.292-294). |
| `useTalkXSegments.ts` — `parts = groups.map(...) )` (espaço antes do parêntese) | ruído cosmético | sem efeito. |
| `supabase.rpc.bind(supabase)` (citado no corpo da PR) | já existia no merge-base | `git show bac62ba98:src/hooks/integrations/useTalkXSegments.ts` linhas 285, 306, 407, 492 — a branch não alterou isso (não aparece no diff). |

## Lacunas a recuperar
Nenhuma. O único hunk ausente da main (escape de `|` em `quoted`) corrompe valores com pipe e não deve ser portado.

## Não verificado
- Execução local dos 3 testes: `node_modules` ausente neste clone e `npx vitest` falha com `EOVERRIDE` (postcss). A conclusão de que os testes passam na main vem da leitura do código + do fato de `e1f2ee4dd` ter sido o commit que "destrava o CI Gate (136 → 0 arquivos vermelhos)".

## Verificação adversarial

Parecer: **CONCORDO — INCORPORADA, apagar branch é seguro.** Tentei refutar hunk por hunk o `git diff bac62ba98 eec06ea3e` (2 arquivos, 6 hunks úteis); nenhum hunk de valor ≥ médio ficou de fora da `main`.

| Hunk da branch | Verificação própria na `origin/main` | Resultado |
|---|---|---|
| `useKnowledgeBase`: estado `error`, `setError(null)` no início, `setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)`, `error` no retorno | `git show origin/main:src/hooks/integrations/useKnowledgeBase.ts` → l.62 `const [error, setError] = useState<string \| null>(null)`, l.65 `setError(null)`, l.73 `setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)`, l.237 retorno com `error`. Ainda **melhor**: try/catch/finally (l.66-78) cobre rejeição de rede, que a branch não cobria. | na main, superado |
| `useKnowledgeBase`: em erro, `setArticles([]); setFiles([])` | main mantém `if (articlesRes.data) …` (l.71-72) de propósito. Os 4 casos de `src/hooks/integrations/__tests__/useKnowledgeBase.erro.test.tsx` (l.40-96) passam com a versão da main: nos testes de erro `data` é `null`/`[]`, então as listas ficam vazias por estado inicial e `error` é preenchido; o único efeito da branch seria apagar lista boa quando a OUTRA tabela falha — exatamente os achados 2 e 3 do Qodo. | não é lacuna |
| `useTalkXSegments`: `lead_origin` com `comingSoon: true` | main l.90 idêntico; teste `useTalkXSegments.test.ts:129-131` exige `['lead_origin','lead_score','risk_score']`. | na main |
| `ruleToFilter`: `if (r.field === 'real_sector' \|\| r.field === 'real_uf') return null` | main l.80-81 marca ambos `ponteOnly: true` e l.209 faz `if (def.ponteOnly) return null` — generalização do mesmo guard. | na main, generalizado |
| `audienceRulesPayload`: `throw new Error('Campo X requer pré-resolução via p_contact_ids')` | main move para `assertNoPonteOnlyFields` (l.280-289, mensagem idêntica), chamada em `countAudience` (l.311) e `resolveAudience` (l.333) — os únicos dois pontos que usam `audienceRulesPayload` (l.314, l.342), confirmado por grep: nenhum terceiro chamador escapa do assert. Testes em `useTalkXSegments.test.ts:341-398` (`rejects.toThrow(/real_sector.*p_contact_ids/)`). | na main, cobertura igual |
| `quoted` passa a escapar `\|` (`/[\\"\|]/g`) | **único hunk ausente da main** (main l.199 segue `/[\\"]/g`) e é defeito. Simulação própria (`node`): branch `quoted('a\|b')` → `"a\"b"`; main → `"a\|b"`. O callback só devolve `\\\\` para `\`, qualquer outro char casado vira `\"`. Qodo achado 4. Nenhum teste nem código da main pede escape de pipe. | não portar |
| `parts = groups.map(…) )` | espaço cosmético. | ruído |

Checagens extras que eu fiz e a triagem não cita:
- **Ponta a ponta na main**: `src/components/knowledge/KnowledgeBaseView.tsx:33` desestrutura `error` e há `KnowledgeBaseView.erro.test.tsx` — o propósito da branch (erro de leitura não virar "base vazia") está integrado até a UI, o que a branch não entregava.
- **Diff completo**: `git diff bac62ba98 eec06ea3e` toca só os 2 arquivos; não há arquivo novo, migration, edge ou workflow escondido (`counts` do JSON confere).

Nada a resgatar. `apagar_branch_seguro = true`.
