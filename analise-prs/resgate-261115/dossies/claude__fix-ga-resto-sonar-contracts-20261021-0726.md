# claude/fix-ga-resto-sonar-contracts-20261021-0726 (PR #2145)

- tip `dc8b63494` · merge_base `d7af7a671` (2026-10-19) · 1 commit · 26 arquivos
- Commit: "GA86+GA99+GA100: restaura workflow-contracts, anti-regressao do plano 15/10, correcoes Sonar"
- Triagem anterior (2026-11-08) marcou #2145 como OBSOLETA. **Não confere**: há 3 lacunas reais, uma delas um gate de banco que hoje é no-op na main.

## Propósito
Três blocos:
1. **GA99** — bloco anti-regressão em `scripts/ci/workflow-contracts.unit.mjs` (6 testes novos) + os ajustes de YAML que esses testes travam (GA08/GA09 no e2e-logado, GA20 no Gate 3, GA21 DSN fora do GITHUB_ENV, digest em imagens).
2. **GA86** — higiene Sonar em massa (`.sort()` → comparador, `parseInt`/`parseFloat` → `Number.*`, `[ ]` → `[[ ]]` em bash, base `https` em teste de URL, sanitização de caminho) + exclusão de `docs/reconciliation/**` no Sonar.
3. **GA100** — ponteiro de "Plano vigente" no `CLAUDE.md`.

A premissa do commit ("workflow-contracts.unit.mjs estava truncado/SyntaxError na main") **é falsa hoje**: `origin/main:scripts/ci/workflow-contracts.unit.mjs` tem 626 linhas, 19 testes, sintaticamente íntegro.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/types-sync.yml` (Gate 3, GA20) | **PERDIDO — ALTO.** Gate 3 compara o catálogo com ele mesmo | main: passo "Aplicar candidatos no worktree" faz `cp /tmp/catalog.new.json supabase/schema-catalog.json` (`origin/main:.github/workflows/types-sync.yml:409`) e o Gate 3 roda `check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json` (linha 485) |
| `.github/workflows/{types-sync,db-migrate,db-live-guard,targeted-ledger-evidence}.yml` (GA21) | **PERDIDO — MÉDIO.** DSN endurecido continua indo para o `GITHUB_ENV` | `origin/main` grava `appendFileSync(process.env.GITHUB_ENV, \`DESTINO_URL=...\`)` em db-live-guard:124, db-migrate:164 (+ `SUPABASE_DB_URL=` :170), types-sync:177, targeted-ledger-evidence:85. Nenhum tem `id: credencial` exceto db-live-guard |
| `.github/workflows/{db-live-guard,types-sync}.yml` (digest) | **PERDIDO — MÉDIO.** `GHCR_IMG` sem digest | `origin/main:.github/workflows/db-live-guard.yml:287` e `types-sync.yml:202` → `ghcr.io/supabase/postgres-meta:v0.98.0` (tag mutável) |
| `scripts/ci/workflow-contracts.unit.mjs` | **PERDIDO PARCIAL — MÉDIO.** 5 dos 6 testes GA99 ausentes | main tem só `GA99: notifica monitora apenas workflows que existem` (origin/main:607). Faltam: e2e-logado if+grupo, Gate 3 via HEAD, stdout do hash (GA04), DESTINO fora do GITHUB_ENV (GA21), `!cancelled()` (GA55), imagem sem digest |
| `scripts/ci/db-migrate-workflow.unit.mjs` | **PERDIDO — MÉDIO** (acompanha GA21) | main ainda afirma `appendFileSync(process.env.GITHUB_ENV, \`DESTINO_URL=...\`)` como invariante |
| `.sonarcloud.properties` | **PERDIDO — BAIXO.** `docs/reconciliation/**` fora da análise | `origin/main:.sonarcloud.properties` → `sonar.exclusions=supabase/schema-manifest.json` (só isso); `docs/reconciliation/` tem 776 arquivos versionados na main |
| `scripts/ci/matriz-oth013-validar.py` | **PERDIDO — BAIXO.** 3 linhas de contenção do caminho do plano dentro do repo | ausente na main (`ABSENT_APPLIES_CLEAN`) |
| `scripts/db-audit/check-remocoes-destrutivas.mjs` | **PERDIDO — BAIXO.** recusa segmento `..` no argumento | ausente na main |
| `.github/workflows/e2e-logado.yml` (GA08/GA09) | **INCORPORADA, em forma superior** | `origin/main:.github/workflows/e2e-logado.yml:13-19` já tem `workflow_run` + `branches: [main]`; `:35-42` o `if:` **no job** com as 5 condições (conclusion success, event push, head_branch main, head_repository == repository, dispatch); `:29-30` grupo serializado com `cancel-in-progress: false`. Grupo é condicional (`main` → `e2e-logado`; dispatch fora da main → grupo próprio), mais evoluído que o grupo fixo da branch |
| `CLAUDE.md` | **OBSOLETA.** linha "Plano vigente" removida de propósito | `origin/main:CLAUDE.md` contém apenas `@AGENTS.md`; removida em `3d292c8ce` ("CLAUDE.md so tecnico, AGENTS.md so as regras do dono", PR #2624) |
| `scripts/edge-deploy/health-check.mjs` | **OBSOLETA.** main reescreveu o parser com validação mais forte | `origin/main:scripts/edge-deploy/health-check.mjs:58-61` usa `Number(optionValue(...))` + regex de inteiro, em vez de `Number.parseFloat/parseInt` |
| `scripts/ci/github-settings-guard.mjs` | **PARCIALMENTE INCORPORADA; resto cosmético** | main já define e usa o comparador `porCodigo` nos pontos que importam (`origin/main:scripts/ci/github-settings-guard.mjs:78`, usado em :185-186, :380-383). Restam 4 `.sort()` sem comparador (:273,:277,:312,:313), todos comparados via `join` → semântica idêntica |
| Higiene Sonar restante (`actions-kpi.unit.mjs`, `bump-toolchain.mjs`, `catalog-ct73-docs.unit.mjs`, `check-test-inventory.mjs`, `lamejs-attack-indexing.unit.mjs`, `consolidar-veredito.mjs`, `run-runtime-contract.mjs`, `v4-status.mjs`, `v4-status.unit.mjs`, `replay-local.sh`, `replay-local-harness.test.sh`, `revoke-auth-sessions.test.sh`, `preparar-artifact-deploy.sh`) | **PERDIDO, valor NENHUM.** `.sort()` → comparador de código, `parseInt` → `Number.parseInt`, `[ ]` → `[[ ]]`, `http://x` → `https://x` em base de `new URL` de teste | ausentes na main; nenhuma mudança de comportamento (ordem lexicográfica e `parseInt` são equivalentes; `[[ ]]` idem para os testes usados) |

## Lacunas a recuperar (hunks)

### 1. ALTO — GA20: Gate 3 do types-sync compara o arquivo com ele mesmo
Na main, o passo "Aplicar candidatos no worktree" sobrescreve `supabase/schema-catalog.json` com o candidato **antes** do Gate 3. Resultado: `DROP TABLE` de objeto ainda consumido pelo `src/` passa o gate. Correção (2 linhas), em `.github/workflows/types-sync.yml`, passo `Gate 3 — remocoes destrutivas`:

```diff
           set -o pipefail
-          if node scripts/db-audit/check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json 2>&1 | tee /tmp/gate3.log; then
+          # GA20: "Aplicar candidatos" copiou o novo por cima do antigo ANTES deste
+          # gate — comparar supabase/schema-catalog.json seria comparar o arquivo com
+          # ele mesmo (um DROP passaria). O antigo vem do git HEAD.
+          git show HEAD:supabase/schema-catalog.json > /tmp/catalog.old.json
+          if node scripts/db-audit/check-remocoes-destrutivas.mjs /tmp/catalog.old.json /tmp/catalog.new.json 2>&1 | tee /tmp/gate3.log; then
```
Observação de porte: na main o Gate 3 vive no job de apply (que faz `actions/checkout`), então `git show HEAD:` funciona; `fetch-depth` default basta.

### 2. MÉDIO — GA21: DSN endurecido sai por outputs, não pelo GITHUB_ENV
Motivo: o arquivo do `GITHUB_ENV` é lido por **todos** os passos seguintes, inclusive actions de terceiros. Padrão (aplicar nos 4 workflows):

```diff
       - name: Exigir credencial do banco oficial
+        id: credencial
         env:
           DESTINO_URL: ${{ secrets.DESTINO_URL }}
...
-          appendFileSync(process.env.GITHUB_ENV, `DESTINO_URL=${destinoSeguro}\n`);
+          appendFileSync(process.env.GITHUB_OUTPUT, `destino=${destinoSeguro}\n`);
           appendFileSync(process.env.GITHUB_ENV, 'PGSSLMODE=verify-full\n');
```
e, em cada passo que usa o banco:
```yaml
        env:
          DESTINO_URL: ${{ steps.credencial.outputs.destino }}
```
No `db-migrate.yml` há também o par do CLI do Supabase:
```diff
-          appendFileSync(process.env.GITHUB_ENV, `SUPABASE_DB_URL=${tls.connectionString}\n`);
+          appendFileSync(process.env.GITHUB_OUTPUT, `supabase_db_url=${tls.connectionString}\n`);
```
com `SUPABASE_DB_URL: ${{ steps.credencial.outputs.supabase_db_url }}` nos dois passos de `supabase db push` (main: linhas 914 e 924). No `types-sync.yml` há um `DESTINO_URL: ${{ env.DESTINO_URL }}` (gate1b) que passa a `${{ steps.credencial.outputs.destino }}`.
Contagem de passos a receber `env:` próprio: db-live-guard 11, db-migrate ~16, types-sync 4, targeted-ledger-evidence 1 (ver `git diff d7af7a671 dc8b63494 -- .github/workflows/` para o mapa exato).
Acompanha: `scripts/ci/db-migrate-workflow.unit.mjs` (trocar as asserções de `GITHUB_ENV` por `GITHUB_OUTPUT`/`steps.credencial.outputs.*`, 21 linhas).

### 3. MÉDIO — digest nas imagens de container
```diff
-          GHCR_IMG="ghcr.io/supabase/postgres-meta:v0.98.0"
+          GHCR_IMG="ghcr.io/supabase/postgres-meta:v0.98.0@sha256:cef71ba901751dcc242cc685cf13786935ea8926820fb342f23bb0fbef77de5a"
```
em `.github/workflows/db-live-guard.yml:287` e `.github/workflows/types-sync.yml:202`. Confirmar o digest antes de aplicar (o valor acima é de 2026-10-21).

### 4. MÉDIO — 5 testes anti-regressão em `scripts/ci/workflow-contracts.unit.mjs`
Fonte pronta: `git show dc8b63494:scripts/ci/workflow-contracts.unit.mjs` linhas 611-778. Estado de cada um contra a main de hoje:

| Teste | Passa na main hoje? | Ação |
|---|---|---|
| `GA99: stdout do hash sai limpo (GA04)` | **Sim** (main: `run-runtime-contract.mjs:296` e `validate-runtime-proof.mjs:649` têm exatamente 1 `process.stdout.write` e nenhum `console.log`; `db-migrate.yml:272` faz `JSON.parse(process.env.RUNTIME_JSON)`) | portar como está |
| `GA99: job com needs reuso exige !cancelled() (GA55)` | **Sim** (nenhum job com `needs: reuso` hoje; guarda o retorno do padrão) | portar como está |
| `GA99: Gate 3 compara contra o catálogo do HEAD` | Não | portar junto da lacuna 1 |
| `GA99: DESTINO_URL fora do GITHUB_ENV (GA21)` | Não | portar junto da lacuna 2 |
| `GA99: nenhuma imagem sem digest` | Não | portar junto da lacuna 3, **mas** a asserção final espera `public.ecr.aws/supabase/postgres:...@sha256:` em `replay-local.sh`; a main usa `ghcr.io/supabase/postgres:17.6.1.159@sha256:86a2e07...` (`origin/main:scripts/db-audit/replay-local.sh:44`). Tornar a regex agnóstica de registry |
| `GA99: e2e-logado exige o if de GA08 e o grupo fixo de GA09` | Não (a parte do `if:` sim; `assert.match(texto, /^  group: e2e-logado$/m)` falha) | adaptar: a main usa grupo condicional (`main` → `e2e-logado`, dispatch fora da main → grupo próprio por `run_id`), que é melhor. Trocar a asserção por "o grupo na main é `e2e-logado`" + `cancel-in-progress: false` |
Também: a versão da branch do teste `notifica monitora` acrescenta `assert.ok(monitorados.length >= 7, ...)` sobre a versão da main (origin/main:607) — piso útil, 1 linha.

### 5. BAIXO — Sonar: excluir `docs/reconciliation/**`
```diff
-sonar.exclusions=supabase/schema-manifest.json
+sonar.exclusions=supabase/schema-manifest.json,docs/reconciliation/**
```
Justificativa da branch (válida: os 776 arquivos continuam na main): são harnesses de auditoria (`.mjs/.cjs/.py`) e relatórios de execução única, nunca rodam em produção nem no CI de PR; geravam ~270 issues BLOCKER/HIGH em "código novo" sem achado em código entregue. Verificar no painel do SonarCloud se o portão ainda sangra por isso antes de aplicar (as issues de outubro já saíram da janela de "código novo").

### 6. BAIXO — endurecimento de caminho em scripts de auditoria
`scripts/ci/matriz-oth013-validar.py`:
```python
    plan_path = plan_path.resolve()
    if ROOT.resolve() not in plan_path.parents and plan_path != ROOT.resolve():
        fail(f"plano fora do repositorio: {plan_path}")
```
`scripts/db-audit/check-remocoes-destrutivas.mjs`:
```js
  if (String(arquivo).split(/[\\/]/).includes('..')) {
    console.error('ERRO: caminho com segmento .. recusado: ' + arquivo);
```
Ambos são CLIs locais de auditoria (argv do próprio operador/CI) — hardening, não vulnerabilidade explorável.

## Veredito
**PERDIDA_PARCIAL** · confiança alta · `apagar_branch_seguro = false`

Incorporado/obsoleto: e2e-logado (GA08/GA09, forma superior na main), `CLAUDE.md` (linha removida de propósito em `3d292c8ce`), `health-check.mjs` (parser reescrito), comparador `porCodigo` do `github-settings-guard` (existe e é usado onde importa), GA04 (stdout já limpo).
Perdido e relevante: Gate 3 do types-sync (alto), GA21 (médio), digest de imagem (médio), 5 testes de contrato (médio), exclusão Sonar (baixo), 2 hardenings de caminho (baixo).
Perdido e irrelevante: ~16 arquivos de higiene Sonar puramente cosmética.

Ordem sugerida de recuperação (uma PR por bloco, todas de escopo CI/workflow): 1 → 4(Gate 3) · 2 → 4(GA21) + `db-migrate-workflow.unit.mjs` · 3 → 4(digest) · 4(GA04/GA55/e2e adaptado) · 5 · 6.

## Verificação adversarial

Tentei refutar o PERDIDA_PARCIAL. **Não consegui: confirmo o veredito** (`concorda=true`), com prova executável e três correções de forma/severidade.

### Prova empírica (não só grep)
Extraí `origin/main` (`.github` + `scripts`) para uma árvore limpa e rodei **os contratos da branch contra os workflows da main**:
`git archive origin/main .github scripts | tar -x -C <scratch>/mainwf` + `git show dc8b63494:scripts/ci/workflow-contracts.unit.mjs` → `node --test` em `<scratch>/mainwf`:
`# tests 25 · # pass 20 · # fail 5`. Os 19 testes próprios da main passam todos (`19/19`), ou seja a main não está quebrada — as 5 falhas são exatamente o delta.

| teste da branch | resultado contra a main | leitura |
|---|---|---|
| GA99 Gate 3 lê catálogo do HEAD | **FALHA** — `Gate 3 precisa ler o catálogo antigo do git HEAD` | lacuna real, alta |
| GA99 DESTINO_URL fora do GITHUB_ENV | **FALHA** — `db-migrate.yml perdeu o passo de credencial` | lacuna real |
| GA99 nenhuma imagem sem digest | **FALHA** — `db-live-guard.yml` e `types-sync.yml`: `ghcr.io/supabase/postgres-meta:v0.98.0` | lacuna real |
| GA99 stdout do hash limpo (GA04) / needs reuso `!cancelled()` (GA55) | passam | contrato aditivo, sem defeito na main |
| GA99 e2e-logado (GA08+grupo fixo GA09) | **FALHA** | o teste é que está obsoleto: a main usa grupo condicional (superior) |
| E68 cache do Playwright (variante da branch) | **FALHA** (`ci.yml`, `e2e-talkx.yml` "sem install-deps sob cache hit") | **falso positivo da branch**: `origin/main:.github/workflows/ci.yml:486-490` tem o passo `playwright install-deps` sob `cache-hit == 'true'`; o matcher da branch não o reconhece |

### Gate 3: no-op confirmado linha a linha
`origin/main:.github/workflows/types-sync.yml`, job `gates-e-pr`: passo `Aplicar candidatos no worktree` (:405-410) faz `cp /tmp/catalog.new.json supabase/schema-catalog.json`; o `Gate 3 — remocoes destrutivas` (:478, comando em :484) roda `check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json` — **mesmo arquivo nas duas pontas, no mesmo job**. Um `DROP` de tabela/função ainda consumida pelo `src/` passa com `passed=true`. Não foi removido de propósito: `git log -S'catalog.old.json' origin/main -- .github/workflows/types-sync.yml` só devolve commits antigos sem relação (1730cd2d4, c41f5e573) e nenhuma mensagem de revert/desativa. O fix da branch encaixa: `gates-e-pr` tem `Checkout confiavel da main`, logo `git show HEAD:supabase/schema-catalog.json` resolve com `fetch-depth` 1.

### Correção 1 — os hunks NÃO são cherry-pick
`ac97c0ea3` (#2339, "separa leitura do banco e escrita da PR") partiu o `types-sync` em dois jobs (`ler-banco` / `gates-e-pr`). A branch ainda usa `steps.diff.outputs.schema_changed` (dc8b63494:…:440); a main usa `needs.ler-banco.outputs.schema_changed`. Reaplicar **à mão** (2 linhas no gate), nunca `git cherry-pick`/apply do patch.

### Correção 2 — GA21 é defesa em profundidade, não vazamento ativo
Em `db-migrate.yml` não há nenhum `uses:` de terceiro **depois** do passo de credencial (:124): os únicos são `actions/checkout`, `actions/setup-node` e `supabase/setup-cli`, todos antes e pinados por SHA. Em `types-sync.yml` depois de :177 só há `actions/upload-artifact` (:353, SHA). Logo o risco hoje é latente (qualquer action nova no job herda o DSN), não um leak em curso → severidade **baixa/média**, abaixo do "médio" da triagem. O veredito não muda; a ordem de recuperação (Gate 3 primeiro) continua certa.

### Correção 3 — o contrato novo entra com 3 testes, não 6
Aplicar `workflow-contracts.unit.mjs` da branch inteiro **quebraria a main** (E68 e e2e-logado GA08/GA09). Entram: Gate 3, GA21, digest (travam defeitos reais) + GA04/GA55 (aditivos, já verdes). Ficam de fora: a variante E68 e o teste de e2e-logado, que medem a forma antiga.

### Outras checagens
- `removido de propósito?` `git log -S'steps.credencial.outputs.destino' origin/main` → **vazio**: o padrão de outputs nunca existiu na main, então não houve rejeição anterior. `b16152f0f` ("use validated database URL") introduziu o endurecimento TLS via `GITHUB_ENV` de propósito; sair para outputs é variante mais estrita, não reversão.
- OBSOLETAS confirmadas: `origin/main:CLAUDE.md` tem só `@AGENTS.md` (`3d292c8ce`, #2624); `origin/main:scripts/edge-deploy/health-check.mjs:54-67` reescreveu o parser com `Number(optionValue(...))` e validação de inteiro em `--wait-ms` (mais forte que `Number.parseInt` da branch); `origin/main:.github/workflows/e2e-logado.yml:33-41` tem o `if` de 5 condições no job e :29-30 o grupo condicional com `cancel-in-progress: false`.
- Sonar GA86: `docs/reconciliation/` ainda tem **776 arquivos** em `origin/main` e `origin/main:.sonarcloud.properties` exclui só `supabase/schema-manifest.json` — a lacuna existe, mas é decisão de política (tirar código de auditoria da análise de segurança), não defeito. Mantém-se em baixo.

**Veredito final: PERDIDA_PARCIAL · `apagar_branch_seguro=false`** — apagar antes de reaplicar o Gate 3 perde o único registro de que o portão destrutivo é um no-op.
