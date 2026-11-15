# Dossiê — claude__fix-esm-sh-regression-261108-2340 (PR #2868)

**Ref:** `origin/claude/fix-esm-sh-regression-261108-2340` · tip `890f8996a` · merge-base `401ea3d4d`
**Veredito:** INCORPORADA (confiança alta) · **apagar branch: seguro**

## Propósito
Trocar `https://esm.sh/@supabase/supabase-js@2.87.1` por `npm:@supabase/supabase-js@2.87.1` nas 2 últimas edges que ainda usavam esm.sh (`external-db-proxy`, `cleanup-rate-limit-logs`) e regenerar `supabase/deployment-manifest.json`. Commits: `67390c405` (fix), `37ba0d35c` (manifest), `890f8996a` (merge main).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/cleanup-rate-limit-logs/index.ts` | JÁ NA MAIN (mesmo import, aspas duplas) | `origin/main:...index.ts:1` → `import { createClient } from "npm:@supabase/supabase-js@2.87.1";` — entrou em `71123cc07 fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)` |
| `supabase/functions/external-db-proxy/index.ts` | JÁ NA MAIN (mesmo import, aspas duplas) | `origin/main:...index.ts:1` → `import { createClient } from "npm:@supabase/supabase-js@2.87.1"` — mesmo commit `71123cc07` (#2865) |
| `supabase/deployment-manifest.json` | OBSOLETO/COBERTO — os hashes da branch referem versões antigas dos arquivos; manifest da main já regenerado e consistente com o fonte atual | `sha256sum` de `origin/main:supabase/functions/cleanup-rate-limit-logs/index.ts` = `0a55ad67…c0f1` = entrada `sha256` no manifest da main; `external-db-proxy` = `48fadc4d…4a89` = entrada no manifest. Último regen: `dac285f62` (#3138) |

`missing_in_main` nas edges é só diferença de aspas simples (branch) vs duplas (main); conteúdo idêntico. `git grep esm.sh origin/main -- supabase/functions/` não retorna nenhum import de supabase-js via esm.sh (restam só comentários e `zod` em `_shared/copilot-tick.ts:21`, fora do escopo desta branch).

## Lacunas a recuperar
Nenhuma. PR #2868 era duplicata de #2865 (mesmo título/causa, mergeada em main).

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Diff integral da branch (`git diff 401ea3d4d origin/claude/fix-esm-sh-regression-261108-2340 --stat`): 3 arquivos, 9 inserções / 9 deleções. Nada além disso. Commits: `67390c405` (fix nas 2 edges), `37ba0d35c` (regenera manifest), `890f8996a` (merge de main, zero conteúdo próprio).

1. **As 2 edges — já na main, idênticas em semântica.**
   - `git show origin/main:supabase/functions/external-db-proxy/index.ts` linha 1: `import { createClient } from "npm:@supabase/supabase-js@2.87.1"`
   - `git show origin/main:supabase/functions/cleanup-rate-limit-logs/index.ts` linha 1: `import { createClient } from "npm:@supabase/supabase-js@2.87.1";`
   - Única diferença vs. a branch: aspas simples (branch) vs duplas (main). Mesmo especificador, mesma versão. Valor zero.
   - Commit que levou isso à main: `71123cc07` — "fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)", com **exatamente o mesmo stat** (3 arquivos, 9/9) da branch. Não houve remoção/revert depois: `git log -S'npm:@supabase/supabase-js@2.87.1' origin/main -- <os 2 arquivos>` lista só adições (`71123cc07`, `e02888738`, `7f3c25944`).
   - `git grep -n esm.sh origin/main -- supabase/functions/` não devolve nenhum import de `@supabase/supabase-js` via esm.sh; sobram só comentários e `zod` em `_shared/copilot-tick.ts:21`, fora do escopo desta branch.

2. **`supabase/deployment-manifest.json` — conteúdo 100% derivado e já obsoleto.**
   - O diff do manifest na branch são apenas 5 valores calculados: `bytes`/`sha256` dos 2 arquivos em `source_files`, `source_sha256` das 2 funções e o `manifest_sha256` final. Nenhuma mudança de `config`, `verify_jwt`, `orphan_allowlist` ou lista de funções.
   - Os hashes da branch já não valem: a main regenerou o manifest ao menos 10 vezes depois de `71123cc07` (`dac285f62`, `2cf0153ae`, `f369f88b2`, `41853318c`, `33ed0eaa9`, `ab657aa34`, `d084ca753`, `f32855df6`, `098a648f6`, `cb6576b2a`). Estado atual da main: `manifest_sha256 = def318ea302d9ccc5f0baa0e99de7f54d2ea2dea21ac05cef4b9b9c5b0e2b6b7`; `source_sha256` de `cleanup-rate-limit-logs` = `aba4f321fce3364891d1e13e80d68b075c2d34788b9be97603e3c671c29e6601` e de `external-db-proxy` = `4f471f35d5a6b60b90e88d5ceb09dffc2ba66087b56b51cc9783e25f297f20bb` — todos diferentes dos da branch e dos de `71123cc07`.
   - Aplicar os hashes da branch hoje seria **regressão**: quebraria o guard do manifest contra as fontes atuais da main.

3. **Nada foi perdido por omissão.** Os 7 `gap_lines_total` do JSON se decompõem em 5 hashes derivados + 2 linhas de import que diferem só nas aspas. `lines_main_has_branch_lacks = 401` contra `124` confirma que a main está à frente em todos os 3 arquivos.

Conclusão: a branch é duplicata integral de uma PR já mergeada (#2868 ≡ #2865) e seu único resíduo exclusivo é um snapshot de hashes vencido. **Apagar a branch é seguro.**
