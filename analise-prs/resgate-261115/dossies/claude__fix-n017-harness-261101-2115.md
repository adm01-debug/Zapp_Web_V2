# Dossiê — claude__fix-n017-harness-261101-2115 (PR #2515)

**Branch:** `origin/claude/fix-n017-harness-261101-2115` · tip `ea7833bcb` · merge-base `1252bb5a4` (01/11/2026) · 1 commit
**Commit:** `ea7833bcb fix: pre-aquecer cache Deno antes do baseline N-017`
**PR #2515:** CLOSED sem merge em 01/11/2026 23:49 — fechada pelo congelamento de features (#2545). Triagem 2804 (08/11): OBSOLETA.

## Propósito
Adicionar, dentro de `scripts/db-audit/multiplix-send-mutation.py`, um `deno cache --config scripts/ci/deno.json supabase/functions/multiplix-send/index.test.ts` antes do baseline do runner de mutação N-017, alegando (corpo da PR) que em runner limpo do GitHub Actions o `deno test --frozen` falharia com `ABORT: a suite ja esta vermelha antes dos mutantes` por cache vazio, quebrando o check obrigatório `Contrato DB offline` em todos os PRs.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/multiplix-send-mutation.py` | MAIN_UNCHANGED_SINCE_BASE · ABSENT_APPLIES_CLEAN (12 linhas ausentes) | **OBSOLETA** — a premissa do fix não se verifica na main: o passo N-017 roda verde em runner limpo sem nenhum `deno cache` | `git grep -n 'deno cache' origin/main -- .github/workflows/ scripts/` → vazio (nenhum pré-aquecimento existe na main). `db-guard.yml:209-211` (Setup Deno 2.9.5) e `:889-890` (passo N-017 chama o script direto). Run `DB Guard (offline)` **43684697261** na `main` (head `dac285f62`, push de 2026-11-15 06:16Z): job `Contrato DB offline` (id 132724034787) `success`; passo nº110 **"Provar por mutação os testes do worker do Multiplix (N-017)" = success** (06:31:33 → 06:32:07, 34 s) — https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43684697261/job/132724034787 |

Detalhe técnico: `--frozen` (e `lock.frozen: true` em `scripts/ci/deno.json`) só proíbe alterar o `deno.lock`; não impede o `deno test` de baixar os módulos remotos e conferi-los contra os hashes do lock. O cache local vazio não causa falha — o próprio run acima prova isso. A falha observada em 01/11 (se ocorreu) não é reproduzível na main atual; a versão da main do script (`2da8e5a41`, #2376, 30/10) é a mesma que a branch tinha como base e segue inalterada.

## Veredito
**OBSOLETA** — confiança alta. O comportamento que o patch pretendia corrigir não existe na `main` atual (passo N-017 verde em runner limpo, sem `deno cache`). Incluir o `deno cache` adicional só acrescentaria um download redundante ao job.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Hunk (referência, não portar)
```
+import pathlib
...
+_cache = subprocess.run(
+    ["deno", "cache", "--config", "scripts/ci/deno.json",
+     "supabase/functions/multiplix-send/index.test.ts"],
+    capture_output=True, text=True,
+    cwd=str(pathlib.Path(__file__).resolve().parent.parent.parent),
+)
+if _cache.returncode != 0:
+    sys.exit("ABORT: deno cache falhou\n" + (_cache.stdout + _cache.stderr)[-800:])
```

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA** (confiança alta). Tentei refutar por três vias; todas reforçam o veredito.

1. **O único hunk da branch realmente está ausente da main, mas perdeu o alvo.** `git diff 1252bb5a4 origin/claude/fix-n017-harness-261101-2115` = +14 linhas em `scripts/db-audit/multiplix-send-mutation.py` (nenhum outro arquivo); `git diff 1252bb5a4 origin/main -- scripts/db-audit/multiplix-send-mutation.py` = vazio (script inalterado desde a base). O patch pré-aquecia **URLs esm.sh**: o corpo da PR #2515 fala dos "42 hashes de `esm.sh/supabase-js`" e, na base `1252bb5a4`, `supabase/functions/multiplix-send/index.ts:10` era `import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1"`. Na main esse import virou `npm:@supabase/supabase-js@2.87.1` (`origin/main:supabase/functions/multiplix-send/index.ts:10`), pelo commit **`7f3c25944` "infra: migra imports esm.sh para npm specifiers nas edge functions (#2753)"** (`git log -S'https://esm.sh/@supabase/supabase-js@2.87.1' origin/main -- supabase/functions/multiplix-send/index.ts`). `origin/main:scripts/ci/deno.lock` tem 0 ocorrências de `esm.sh` e registra `"npm:@supabase/supabase-js@2.87.1"`. Ou seja: a classe de dependência que o `deno cache` existia para baixar **não está mais no caminho de código**. Portar o hunk não corrigiria nada.

2. **O substituto alegado (passo verde sem pré-aquecimento) confere ao vivo, e não há cache de Deno escondido.** `github_get_job(132724034787)` (run 43684697261, head `dac285f62`, branch `main`): job `Contrato DB offline` success; passo **nº110 "Provar por mutação os testes do worker do Multiplix (N-017)" = success, 06:31:33→06:32:07**. O único `actions/cache` do job é o passo nº7 "Cache do Bun (instalacao)" (`origin/main:.github/workflows/db-guard.yml:188-192`, `path: ~/.bun/install/cache`, key por `bun.lock`) — **`DENO_DIR` não é cacheado entre runs** (`git grep DENO_DIR origin/main -- .github/workflows/` → vazio), então o runner começa frio para módulos Deno e o passo passa assim mesmo. Único passo pulado no job foi o nº4 (edição de migration); os passos não têm filtro de caminho (só 6 `if:` no arquivo inteiro, nenhum sobre N-017 — `db-guard.yml:889-890` chama `python3 scripts/db-audit/multiplix-send-mutation.py` direto).

3. **Ressalva de método (não muda o veredito):** o passo nº17 do mesmo job (`scripts/db-audit/gmail-cas-postgrest.test.sh:329`) já roda `deno test --config scripts/ci/deno.json --frozen` antes do nº110, de modo que o `DENO_DIR` pode estar aquecido *dentro do job* quando o N-017 roda. Logo, "runner limpo" é exato quanto ao runner (sem cache entre runs), mas o nº110 não é a primeira invocação de Deno do job. Isso não salva a branch: não existe pré-aquecimento dedicado na main, o check obrigatório está verde há runs seguidos e o alvo do patch (esm.sh) foi removido por #2753.

4. **Defeito próprio do patch, caso alguém pense em portar:** o `deno cache` adicionado omite `--node-modules-dir=none`, que o comando de teste do script usa (`multiplix-send-mutation.py:16-20`), enquanto `scripts/ci/deno.json` traz `nodeModulesDir: "auto"` — o pré-aquecimento resolveria npm por `node_modules` e o teste não, divergência gratuita.

**Lacunas adicionais: nenhuma.** `apagar_branch_seguro = true` (PR #2515 closed, não mergeada, `draft`, `mergeable_state: behind`, 1 arquivo / +14 / -0).
