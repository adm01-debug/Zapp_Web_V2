# Dossiê — claude__ci-deploy-functions-build-id-261114-0017 (PR #3055)

**Branch:** `origin/claude/ci-deploy-functions-build-id-261114-0017` · tip `801b605aa` · merge-base `f32855df6` · 1 commit, 1 arquivo (+13 linhas).

## Propósito
`ci(deploy-functions): publicar ZAPP_BUILD_ID nas edges apos o deploy` — adiciona ao `.github/workflows/deploy-functions.yml` o passo `Publicar ZAPP_BUILD_ID nas edges` (`supabase secrets set ZAPP_BUILD_ID="$DEPLOYED_GIT_SHA"`), para que `GET /status` das edges (`status/index.ts:26`, `Deno.env.get('ZAPP_BUILD_ID') ?? 'unknown'`) informe o build publicado.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/deploy-functions.yml` | **INCORPORADA** — o passo inteiro está na main em `origin/main:.github/workflows/deploy-functions.yml:535-549` (mesmo nome, mesmo `env`, mesmo `run`). Entrou pelo pacote 4 `d084ca753` (PR #3063), que mergeou esta branch `--no-ff` e em seguida o commit `3dd22cf66` (`ci(deploy-functions): ZAPP_BUILD_ID só em deploy completo, nunca em parcial`, contido em `pr/3063`). | `git grep -n ZAPP_BUILD_ID origin/main -- .github/workflows/deploy-functions.yml` → linhas 535, 537, 549. `git log -S"inputs.rollback_to_last_success != true" origin/main -- <arquivo>` → `d084ca753`. |

### A única linha "ausente" (comentário)
`# Grava o SHA DEPLOYADO (em rollback e' o ancestral publicado, nao a main).`

Removida **de propósito** em `3dd22cf66` (dentro da própria PR de pacote): a main restringiu o `if` para
`inputs.dry_run != true && inputs.function_name == '' && inputs.source_ref == '' && inputs.rollback_to_last_success != true`
(linha 543) e trocou o comentário por "So em deploy completo da main: secret e' do projeto todo (...) em deploy parcial ou rollback (...) o SHA publicado nao vale para as demais funcoes -- mesma regra de scripts/edge-deploy/secrets-scope.mjs" (linhas 539-542). Em rollback o passo não roda mais, logo o comentário da branch ficaria falso. `git log --all -S"Grava o SHA DEPLOYADO"` mostra só `801b605aa` (adiciona) e `3dd22cf66` (remove).

A diferença é um refinamento consciente (comentário + condição mais restrita), não lacuna. `lines_main_has_branch_lacks: 5` = as 4 linhas novas de comentário + o `if` ampliado.

## Veredito
**INCORPORADA** · confiança **alta** · `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

**Parecer: CONCORDO com a triagem. `INCORPORADA`, `apagar_branch_seguro = true`.** Tentei refutar e não achei nenhum hunk de valor não coberto.

Checagens independentes (todas em `origin/main`, leitura apenas):

1. **O diff da branch é um único hunk.** `git diff f32855df6 origin/claude/ci-deploy-functions-build-id-261114-0017 -- .github/workflows/deploy-functions.yml` = +13 linhas, só o passo `Publicar ZAPP_BUILD_ID nas edges`. Não há segundo hunk escondido nem outro arquivo (`files` do JSON tem 1 entrada e confirmei pelo diff).
2. **O passo está na main, idêntico no que executa.** `git show origin/main:.github/workflows/deploy-functions.yml` linhas 535–549: mesmo `name`, mesmo `env` (`SUPABASE_ACCESS_TOKEN`, `PROJECT_REF: tnnnlkbymytvtqngbbqh`), mesmo `run` (`set -euo pipefail` + `supabase secrets set ZAPP_BUILD_ID="$DEPLOYED_GIT_SHA" --project-ref "$PROJECT_REF"`). Nenhuma linha de código/execução da branch falta.
3. **O passo na main funciona de fato** (não entrou quebrado): `DEPLOYED_GIT_SHA` é definido e exportado em `origin/main:.github/workflows/deploy-functions.yml:198-205` (`echo "DEPLOYED_GIT_SHA=..." >> "$GITHUB_ENV"`) e o workflow tem um único job (`deploy`, linha 98), logo a variável alcança a linha 549. O consumidor existe: `origin/main:supabase/functions/status/index.ts:26` (`Deno.env.get('ZAPP_BUILD_ID') ?? 'unknown'`).
4. **A única linha ausente é comentário, removido de propósito.** `git log --all -S"Grava o SHA DEPLOYADO" -- .github/workflows/deploy-functions.yml` → só `801b605aa` (adiciona) e `3dd22cf66` (`ci(deploy-functions): ZAPP_BUILD_ID só em deploy completo, nunca em parcial`). O comentário afirmava "em rollback e' o ancestral publicado"; a main restringiu o `if` (linha 543) para excluir rollback/parcial, então manter o comentário seria documentar comportamento falso. Substituído pelas linhas 539–542, que citam `scripts/edge-deploy/secrets-scope.mjs` — arquivo que existe em `origin/main` (`git ls-tree origin/main -- scripts/edge-deploy/secrets-scope.mjs` → blob `572a81f02`). Zero valor executável perdido.
5. **Rastro do merge confere.** `git log --oneline -S"Publicar ZAPP_BUILD_ID nas edges" origin/main -- <arquivo>` → `d084ca753` (pacote 4, PR #3063), consistente com o comentário de fechamento da #3055.

**Correção de um detalhe do dossiê (não muda o veredito):** `git merge-base --is-ancestor 801b605aa origin/main` responde **falso** — o tip da branch *não* é ancestral da main. O pacote 4 entrou por squash (regra do repo: squash only), então a prova de incorporação é de **conteúdo** (item 2), não de ancestralidade. Apagar a branch continua seguro porque nada executável dela falta na main, mas quem auditar não deve esperar achar `801b605aa` no histórico da `main`.

**Observação sobre a main (não é conteúdo da branch a resgatar):** com o `if` restrito, um rollback ou deploy parcial **não** reescreve `ZAPP_BUILD_ID`. Depois de um rollback, `GET /status` reporta o SHA do build anterior ao rollback — ou seja, o SHA da versão retirada do ar. É decisão tomada em `3dd22cf66` com justificativa escrita (o secret é do projeto inteiro), não lacuna desta branch; registro só para que não seja confundido com defeito novo se aparecer em diagnóstico de `/status`.
