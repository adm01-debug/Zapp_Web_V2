# Dossiê — claude__fix-esm-sh-regression-261108-2320 (PR #2862)

**Ref:** `origin/claude/fix-esm-sh-regression-261108-2320` · tip `db7fc375` · merge-base `9183f0f6` · 1 commit.

## Propósito
`fix(edges): substitui esm.sh por npm: em external-db-proxy e cleanup-rate-limit-logs` — trocar
`https://esm.sh/@supabase/supabase-js@2.87.1` por `npm:@supabase/supabase-js@2.87.1` nas 2 edges que ainda
usavam esm.sh (regressão do padrão de #2753). Único efeito funcional: a linha de import de cada arquivo.
O resto do diff (−74 linhas) é remoção de comentários explicativos (R2-API-022, SEC-EDGE_FUNCTIONS-02,
Z018/Z020, nota sobre `EVOLUTION_VPS_SUPABASE_*`) e ASCII-ficação do cabeçalho JSDoc — sem mudança de código.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/cleanup-rate-limit-logs/index.ts` | **Import já na main** (`npm:`). Comentários removidos pela branch continuam na main de propósito. | `git show origin/main:supabase/functions/cleanup-rate-limit-logs/index.ts \| head -1` → `import { createClient } from "npm:@supabase/supabase-js@2.87.1";`. Commit na main: `71123cc07 fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)`. `git diff origin/main <branch> -- <arquivo>` filtrado sem linhas de comentário → **vazio** (só comentários diferem). |
| `supabase/functions/external-db-proxy/index.ts` | **Import já na main** (`npm:`, aspas duplas; branch usa simples). Diferenças restantes: comentários inline removidos nas 3 linhas de `code === ...` e blocos de comentário. | `git show origin/main:supabase/functions/external-db-proxy/index.ts \| head -1` → `import { createClient } from "npm:@supabase/supabase-js@2.87.1"`. Mesmo commit `71123cc07` (#2865). Diff não-comentário main×branch: só a troca `"`→`'` no import e remoção dos comentários de fim de linha em `PGRST116/42P01/42501`. |

`git grep -n "esm.sh" origin/main -- supabase/functions` → nenhum import de `@supabase/supabase-js` via esm.sh
restante (só `_shared/copilot-tick.ts:21` importa `zod` via esm.sh, fora do escopo desta branch, e menções em comentários).

A main foi além da branch: #2865 também atualizou `supabase/deployment-manifest.json` (14 linhas), que esta
branch não tocou.

## Veredito
**INCORPORADA** (confiança alta). O trabalho útil (import `npm:`) está na main via #2865 (`71123cc07`).
As "lacunas" mecânicas (`missing_in_main`=5, `removed_still_in_main`=66) são exclusivamente:
- remoção de comentários de documentação de segurança/decisões (R2-API-022, SEC-EDGE_FUNCTIONS-02, Z018, Z020,
  motivo dos secrets `EVOLUTION_VPS_*`, nota sobre `in` do PostgREST) — valor **nenhum** (a main mantê-los é melhor);
- aspas simples vs duplas no import — valor **nenhum**;
- cabeçalho JSDoc sem acentos — valor **nenhum**.

Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Provas que eu mesmo rodei (não reaproveitadas da triagem):

1. `git diff 9183f0f6 origin/claude/fix-esm-sh-regression-261108-2320 --stat` → 2 arquivos, **+6/−74**.
   Lido o diff inteiro: a **única** linha funcional em cada arquivo é o import
   (`https://esm.sh/@supabase/supabase-js@2.87.1` → `npm:@supabase/supabase-js@2.87.1`).
   As outras 72 linhas removidas são exclusivamente comentários (`*`, `//`) e a ASCII-ficação do JSDoc.
   Nenhuma diretiva funcional foi removida: os `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
   aparecem como **contexto** (prefixo espaço), não como remoção.

2. Import já na main:
   - `git show origin/main:supabase/functions/cleanup-rate-limit-logs/index.ts | head -1` →
     `import { createClient } from "npm:@supabase/supabase-js@2.87.1";`
   - `git show origin/main:supabase/functions/external-db-proxy/index.ts | head -1` →
     `import { createClient } from "npm:@supabase/supabase-js@2.87.1"`

3. Único commit da main nesses 2 arquivos desde o merge-base:
   `git log --oneline 9183f0f6..origin/main -- <os 2 arquivos>` → **só** `71123cc07`
   (`fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)`).
   `git show 71123cc07 --stat` → os 2 index.ts (2 linhas cada) **+ `supabase/deployment-manifest.json` (14 linhas)**
   que a branch não tocou → a main está **estritamente à frente**.

4. Delta residual main × branch nesses 2 arquivos, filtrando linhas de comentário
   (`git diff origin/main <branch> -- <os 2> | grep -vE '^[+-]\s*(\*|//|/\*)'`) → **8 linhas, todas cosméticas**:
   - `"npm:…"` → `'npm:…'` (aspas duplas → simples) em `external-db-proxy/index.ts:1`;
   - remoção dos comentários de fim de linha em `code === 'PGRST116' | '42P01' | '42501'`
     (`external-db-proxy/index.ts:20-22`).
   Em `cleanup-rate-limit-logs/index.ts` o filtro não devolveu **nada**: só comentários diferem.

5. Os 5 `missing_in_main` do JSON são exatamente esses itens cosméticos (JSDoc sem acento, import com
   aspas simples, 3 linhas `code ===` sem comentário) — confirmado linha a linha no diff. Nenhuma lacuna real.

6. `git grep -n "esm.sh" origin/main -- supabase/functions` → nenhum import de `@supabase/supabase-js` por
   esm.sh restante. O único import real por esm.sh na main é
   `supabase/functions/_shared/copilot-tick.ts:21` (`zod@3.23.8`) — **fora do escopo** desta branch (ela não
   tocou nesse arquivo), portanto não é lacuna dela. Fica como observação separada.

**Conclusão:** aplicar a branch hoje seria uma regressão (perderia a documentação de segurança R2-API-022,
SEC-EDGE_FUNCTIONS-02, Z018/Z020 e o motivo dos secrets `EVOLUTION_VPS_*`) sem ganho algum.
`apagar_branch_seguro = true`.
