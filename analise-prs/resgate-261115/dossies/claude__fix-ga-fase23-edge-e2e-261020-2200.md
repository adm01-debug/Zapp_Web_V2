# Triagem — claude/fix-ga-fase23-edge-e2e-261020-2200 (PR #2128)

- ref: `origin/claude/fix-ga-fase23-edge-e2e-261020-2200` · tip `420aae588` · merge_base `351ccb2a6` (2026-10-23)
- commits: `963d20aee fix(ga): fase 2-3 edge+e2e GA27-35 GA38-39 GA42-44 GA46-47`, `9dbe470f0 chore(merge)`, `420aae588 fix(lint): excluir worktrees nomeados + regenerar baseline`
- Triagem anterior (2026-11-08) dizia **OBSOLETA**. Verificado: **errado em parte** — 4 lacunas reais sobrevivem (2 de valor alto).

## Propósito
Pacote "fase 2-3" de CI/edge: portão de typecheck/teste das edges no deploy (GA27), resolvedor de rollback
extraído (GA30), segredos fora do `argv` (GA32), deploy parcial quando preflight externo adoece (GA33/34),
redação estrutural de token em artefato de E2E (GA38), logout do teardown (GA39), marcador de specs (GA42),
resumo de error-context (GA44) e contrato contra projeto Playwright órfão (GA47).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/ci.yml` | OBSOLETA — a branch troca `firefox-email-navy`/`webkit-email-navy` por `chromium-telefonia` no job de PR; a main mantém os dois e já roda telefonia no e2e-logado | `origin/main:.github/workflows/ci.yml:502`; `origin/main:e2e/quarantine.unit.mjs:33` (`chromium-telefonia` em ORIGINAIS) |
| `.github/workflows/deploy-functions.yml` (GA27) | INCORPORADA em efeito — `deno check` com `--config` na main; `deno test` das edges roda no ci.yml (check obrigatório) | `origin/main:.github/workflows/deploy-functions.yml:491-494`; `origin/main:.github/workflows/ci.yml:223` |
| `.github/workflows/deploy-functions.yml` (GA30) | **PERDIDA** — `scripts/edge-deploy/resolve-rollback-ref.mjs` está na main (idêntico ao da branch) mas **nenhum workflow o chama**; o resolvedor inline continua escolhendo o success mais recente, que pode ser o próprio SHA atual (rollback no-op) | `git grep -ln resolve-rollback-ref origin/main` → só o próprio script + unit + docs; inline em `origin/main:.github/workflows/deploy-functions.yml:147-180` (`RESOLVED_SOURCE_REF` em :177) |
| `.github/workflows/deploy-functions.yml` (GA32) | **PERDIDA** — segredos ainda viajam no `argv` de `supabase secrets set` | `origin/main:.github/workflows/deploy-functions.yml:315, 370, 412, 441` |
| `.github/workflows/deploy-functions.yml` (GA33/GA34) | OBSOLETA/contrária ao desenho — a main falha fechado no preflight de propósito ("aborta antes de publicar se algo falhar") | cabeçalho em `origin/main:.github/workflows/deploy-functions.yml:30-33`; `::error:: + exit 1` nos preflights (:335, :386) |
| `.github/workflows/deploy-functions.yml` (filtro de paths) | **PERDIDA** (pequena) — falta `- '!supabase/functions/**/__fixtures__/**'`; os fixtures existem e disparam deploy de produção à toa | filtro em `origin/main:.github/workflows/deploy-functions.yml:38-42` (só `fixtures/**`); `supabase/functions/_shared/__fixtures__/evolution-call-*.json` |
| `.github/workflows/e2e-logado.yml` (GA44/GA46) | OBSOLETA — workflow reescrito: gate `workflow_run` success+push+main+mesmo repo (o que GA46 chamava de "pendente GA08"), matriz de 5 grupos, backend descartável e **só artefato já redigido** | `origin/main:.github/workflows/e2e-logado.yml:1-8, 13, 37-41, 152-160` |
| `e2e/quarantine.unit.mjs` | OBSOLETA — branch quer 21 projetos; a main fixa 15 em `ORIGINAIS` com matriz de 5 grupos e `runtime-contract.mjs` | `origin/main:e2e/quarantine.unit.mjs:19-34, 133` |
| `eslint.config.js` | PERDIDA (cosmética) — ignores de worktrees manuais (`Zapp_fase456/**`, `zapp-worktrees/**`) ausentes | `origin/main:eslint.config.js:13` (`{ ignores: ["dist", ".claude/worktrees/**"] }`) |
| `scripts/ci/ci-e2e-projects.unit.mjs` (GA47) | **PERDIDA — a mais valiosa**: a main tem **4 projetos órfãos** (spec que nunca roda em workflow algum) | computado: 28 projetos em `origin/main:playwright.config.ts` vs tokens `--project=` de ci/e2e-logado/e2e-talkx/e2e-logado-isolado → órfãos: `chromium-talkx` (:185), `chromium-onboarding-dispensar` (:104), `chromium-multiplix-responsivo` (:124), `chromium-tarefas-linha-de-base` (:169) |
| `scripts/ci/e2e-teardown.mjs` + `.unit.mjs` (GA39) | PERDIDA de valor baixo — logout ausente, mas o workflow não chama mais o teardown de produção | `origin/main:.github/workflows/e2e-logado.yml:8` ("Scripts de teardown de produção permanecem versionados; este workflow não os chama"); `git grep -ln e2e-teardown origin/main` → só script/unit/docs |
| `scripts/ci/eslint-baseline.json` | Artefato gerado (sha do config) — valor nenhum | — |
| `scripts/ci/marcador-specs.mjs` (GA42) | PERDIDA de valor baixo — `nomesDeTestResults` sem filtro de `.playwright-artifacts*`/`-retryN`, mas a função não é mais chamada: a issue é montada de `results-summary.json` | `origin/main:scripts/ci/marcador-specs.mjs:32`; consumo real em `origin/main:.github/workflows/e2e-logado.yml:173-200` |
| `scripts/ci/redigir-relatorio.mjs` + `.unit.mjs` (GA38) | PERDIDA de valor baixo — redator sem chamador em workflow; a main protege por exclusão de artefato (`!**/error-context.md`, `!**/*.zip`) | `git grep -ln redigir-relatorio origin/main` → só script/unit/docs; `origin/main:.github/workflows/ci.yml:516-520`; `origin/main:.github/workflows/e2e-talkx.yml:134-138` |
| `scripts/edge-deploy/health-check.mjs` + `.unit.mjs` (GA29) | **OBSOLETA com prova** — a main implementou a mesma ideia melhor e o teste da main **proíbe** a forma da branch (`source = 'edge_logs'`), usando `function_edge_logs`; GET em `/analytics/endpoints/logs` e `validateSlug` que lança | `origin/main:scripts/edge-deploy/health-check.mjs:111, 118, 174, 182`; `origin/main:scripts/edge-deploy/health-check.unit.mjs:96, 99-101`; commits `77dd76417`, `3a8161c7e`, `d1fc5ad6a` |
| `scripts/edge-deploy/resolve-rollback-ref.mjs` + `.unit.mjs` | INCORPORADA — byte a byte igual à main | `status: IDENTICAL_TO_MAIN` / `hunk: PRESENT_BYTE` |
| `src/hooks/chat/useFilesContainerColumns.ts` | OBSOLETA — a main tem `[ref]` nas deps do `useLayoutEffect`; o `eslint-disable react-hooks/exhaustive-deps` não tem alvo | `origin/main:src/hooks/chat/useFilesContainerColumns.ts` (`}, [ref]);` no fim do `useLayoutEffect`) |

## Veredito: PERDIDA_PARCIAL (confiança alta) — não apagar a branch

## Lacunas a recuperar (em ordem de valor)

### 1. ALTO — 4 suítes E2E nunca rodam (GA47, `scripts/ci/ci-e2e-projects.unit.mjs`)
Hoje `talkx.spec.ts`, `onboarding-dispensar.spec.ts`, `multiplix-responsivo.spec.ts` e
`tarefas-linha-de-base.spec.ts` existem, têm projeto dedicado no `playwright.config.ts` e **não entram em
nenhum workflow**. O guard da branch pega isso:

```js
// GA47: contrato INVERSO -- todo projeto do playwright.config.ts roda em algum
// workflow (ci.yml, e2e-logado.yml ou e2e-talkx.yml) ou esta na ALLOWLIST com prazo.
const talkxYml = ler('.github/workflows/e2e-talkx.yml');
const doTalkx = projetosNoWorkflow(talkxYml);
const ALLOWLIST_ORFAOS = {
  // exemplo: "chromium-novo": { prazo: "2026-12-31", motivo: "issue #0000" },
};

test('GA47: nenhum projeto do playwright.config.ts e orfao', () => {
  const cobertos = new Set([...doCi, ...doLogado, ...doTalkx]);
  const orfaos = [...projetos.keys()].filter((n) => !cobertos.has(n) && !(n in ALLOWLIST_ORFAOS));
  assert.deepEqual(orfaos, [], `projetos sem workflow: ${orfaos.join(", ")}`);
});
```
Ao portar: (a) incluir `e2e-logado-isolado.yml` na varredura; (b) **não** portar os dois testes finais da
branch (`chromium-telefonia` no ci.yml e email-navy no e2e-logado) — contrariam a main; (c) corrigir o bug
do regex do prazo na branch (`/^\\d{4}-\\d{2}-\\d{2}$/` dentro de literal nunca casa; usar `/^\d{4}-\d{2}-\d{2}$/`);
(d) o teste só fica verde depois de colocar os 4 projetos em um workflow (ou na allowlist com prazo).
Mesmo arquivo traz o ajuste útil de `storageState: { cookies: [], origins: [] }` (sessão zerada não é login real):
```js
const semSessaoZerada = bloco.replace(/storageState:\s*\{\s*cookies:\s*\[\],\s*origins:\s*\[\]\s*\}/g, '');
assert.doesNotMatch(semSessaoZerada, /dependencies:\s*\[|storageState:/, ...);
```

### 2. ALTO — rollback de edge functions com código morto (GA30, `.github/workflows/deploy-functions.yml`)
`scripts/edge-deploy/resolve-rollback-ref.mjs` (+ unit) está na main e não é chamado; o bloco inline
(`:147-180`) aceita o success mais recente, que no cenário real de rollback é o **próprio SHA quebrado**.
Patch da branch (substitui o heredoc `node --input-type=module <<'NODE' ... NODE` inteiro):
```yaml
          # GA30: resolvedor extraido para scripts/edge-deploy/resolve-rollback-ref.mjs
          # (fixture em resolve-rollback-ref.unit.mjs: success mais recente =
          # SHA atual -> escolhe o anterior; sem anterior -> recusa com exit 1).
          node "$RUNNER_TEMP/edge-tooling/scripts/edge-deploy/resolve-rollback-ref.mjs"
```
E a descrição do input `rollback_to_last_success` passa a: `'W66/GA30: ... o ultimo Deployment bem-sucedido
ANTERIOR ao SHA atual ... Recusa se nao houver. Rollback com migration aplicada no lote exige PR de revert
da migration (deploy nao desfaz DDL).'` Conferir que o passo roda depois de preparar `$RUNNER_TEMP/edge-tooling`.

### 3. MÉDIO — segredo no `argv` de `supabase secrets set` (GA32, `.github/workflows/deploy-functions.yml`)
Hoje em 4 pontos (`:315`, `:370`, `:412`, `:441`). Forma da branch (apenas o `--env-file`; **ignorar** os
blocos `-K "$HDR_*"` da branch, que estão quebrados: `header = "apikey: %s\n` sem fechar a aspa, `mktemp`
dentro do ramo de erro do catálogo e um `$(curl ...` sem fechar o parêntese):
```bash
              ENVFILE="$(mktemp)"; chmod 600 "$ENVFILE"
              printf 'CRON_SECRET=%s\n' "$CRON_SECRET" > "$ENVFILE"
              supabase secrets set --env-file "$ENVFILE" --project-ref "$PROJECT_REF"
              rm -f "$ENVFILE"
```

### 4. MÉDIO — fixture dispara deploy de produção (`.github/workflows/deploy-functions.yml`, bloco `push.paths`)
```yaml
      - '!supabase/functions/**/__fixtures__/**'
```
(ao lado de `- '!supabase/functions/**/fixtures/**'`, linha 42 da main).

### 5. BAIXO — itens de valor marginal
- `scripts/ci/e2e-teardown.mjs` (GA39): `logoutSessaoAtual` + `principalLogout` + subcomando `logout` +
  `::warning::` nos erros; o unit correspondente em `e2e-teardown.unit.mjs`. Sem chamador no workflow atual.
- `scripts/ci/marcador-specs.mjs` (GA42): filtrar `.playwright-artifacts*` e colapsar `-retry\d+$`
  em `nomesDeTestResults` (função já não usada pelo workflow).
- `scripts/ci/redigir-relatorio.mjs` (GA38): `PADROES_TOKEN` + `redigirPadroes` (JWT, access/refresh_token
  em JSON e query, `Authorization: Bearer`) ligados em `redigirTextoComZipEmbutido`/`redigirZip`; script sem
  chamador em workflow.
- `eslint.config.js`: `{ ignores: ["dist", ".claude/worktrees/**", "Zapp_fase456/**", "zapp-worktrees/**"] }`
  (e então regenerar `scripts/ci/eslint-baseline.json`, cujo `eslintConfigSha256` está casado com o config).

## Não portar
`health-check.mjs`/`.unit.mjs` (a main proíbe `source = 'edge_logs'`), `e2e-logado.yml`, `quarantine.unit.mjs`,
`ci.yml`, GA33/GA34 do deploy, `src/hooks/chat/useFilesContainerColumns.ts`, `eslint-baseline.json` da branch.

## Verificação adversarial

Refutação tentada contra `origin/main` em `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5` (2026-11-15).
Veredito da triagem **CONFIRMADO: PERDIDA_PARCIAL** — as 4 lacunas existem; **nenhuma** delas jamais
esteve na main (não houve remoção/revert deliberado) e todas encaixam no código atual.

### Prova de que nada foi removido de propósito
- `git log -S'ALLOWLIST_ORFAOS' --oneline origin/main` → vazio
- `git log -S'nenhum projeto do playwright.config.ts e orfao' --oneline origin/main` → vazio
- `git log -S'resolve-rollback-ref.mjs' --oneline origin/main -- .github/workflows/deploy-functions.yml` → vazio
- `git log -S'--env-file' --oneline origin/main -- .github/workflows/deploy-functions.yml` → vazio

### Lacuna 1 (GA47) — confirmada, mas o RESUMO DA TRIAGEM EXAGERA
Órfãos recomputados por mim (28 nomes em `origin/main:playwright.config.ts` menos todo token `--project=`
de `ci.yml`, `e2e-logado.yml`, `e2e-talkx.yml`, `e2e-logado-isolado.yml`): exatamente
`chromium-talkx`, `chromium-onboarding-dispensar`, `chromium-multiplix-responsivo`,
`chromium-tarefas-linha-de-base`. Nenhum workflow roda a suíte sem `--project=`
(`origin/main:.github/workflows/ci.yml:502`, `e2e-talkx.yml:111,116,121` — o único `--list` é
`e2e-talkx.yml:105`). Quarentena está vazia (`origin/main:e2e/quarantine.js:22` → `[]`), então nada é
ignorado de propósito. Guard roda de fato no CI: `origin/main:.github/workflows/ci.yml:166`
(`node --test scripts/ci/*.unit.mjs`), e o arquivo da main só tem o contrato DIRETO
(`origin/main:scripts/ci/ci-e2e-projects.unit.mjs:120,179` — "todo `--project=` existe no config"),
nunca o inverso.

**Correção ao resumo:** "4 suítes E2E não rodam em nenhum workflow" é **falso para 2 delas**. O projeto
catch-all `chromium-authenticated` (`origin/main:playwright.config.ts:134`) tem `testIgnore` que lista
`talkx-launch`, `talkx-visual`, `telefonia`, `tarefas-quadro`, `tarefas-linha-de-base`,
`multiplix-responsivo` — mas **não** `talkx.spec.ts` nem `onboarding-dispensar.spec.ts`. Logo:
- `e2e/talkx.spec.ts` **roda** (catch-all + `firefox-talkx`/`webkit-talkx` no `e2e-logado.yml`);
- `e2e/onboarding-dispensar.spec.ts` **roda** (catch-all);
- `e2e/multiplix-responsivo.spec.ts` e `e2e/tarefas-linha-de-base.spec.ts` **nunca rodam** (ignoradas no
  catch-all e com projeto dedicado fora de todo workflow) — estas duas são spec morta de verdade.
Valor da lacuna segue **alto** (2 réguas visuais nunca executam + 4 projetos órfãos sem guard), só não é
o quádruplo alegado.

### Lacuna 2 (GA30) — confirmada, com um porém de portabilidade
`scripts/edge-deploy/resolve-rollback-ref.mjs` está na main e documenta exatamente a correção
("o `success` mais recente pode ser o proprio SHA atual ... ele e PULADO ... senao RECUSA exit 1",
`origin/main:scripts/edge-deploy/resolve-rollback-ref.mjs:26-36`). O inline da main
(`origin/main:.github/workflows/deploy-functions.yml:143-184`) aceita o primeiro deployment com status
`success` (`:175-179`) **sem comparar com `GITHUB_SHA`** → rollback pode republicar o SHA quebrado.
`git grep -ln resolve-rollback-ref origin/main` → só o script, seu unit e docs; nenhum workflow.
**Porém:** o patch da branch chama `node "$RUNNER_TEMP/edge-tooling/..."`, e nesse ponto o diretório ainda
não existe — o job é único (`deploy`, `:98`) e a ordem na main é resolver (`:143`) → checkout (`:186`) →
`git archive scripts/edge-deploy` para `$RUNNER_TEMP/edge-tooling` (`:215-216`). Portar como está quebra o
step. Ao recuperar: mover a resolução para depois de `:216` (ajustando `ref:` do checkout) ou buscar o
script antes. Isso não reduz o valor da lacuna; é instrução de porte.

### Lacuna 3 (GA32) — confirmada
`supabase secrets set <NOME>="$VALOR"` segue no argv em `origin/main:.github/workflows/deploy-functions.yml:315,
370, 412, 441` (o `:549` é `ZAPP_BUILD_ID` = SHA, não segredo).

### Lacuna 4 (paths) — confirmada
Filtro em `origin/main:.github/workflows/deploy-functions.yml:36-42` exclui `*.test.ts`, `*.md` e
`fixtures/**`, e `fixtures/**` **não** casa `__fixtures__`. Existem 4 arquivos vivos:
`supabase/functions/_shared/__fixtures__/evolution-call-{accept,offer,reject,terminate}.json`. Efeito real
é run de deploy à toa (o CLI pula função cujo bundle já bate) — valor baixo/médio, como a triagem pôs.

### Conclusão
`concorda = true`, `veredito_final = PERDIDA_PARCIAL`, **não apagar a branch**. Única correção material:
a lacuna 1 vale por 2 specs que nunca rodam (não 4) + os 4 projetos órfãos.
