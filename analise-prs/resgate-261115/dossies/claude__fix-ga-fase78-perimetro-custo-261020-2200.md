# claude__fix-ga-fase78-perimetro-custo-261020-2200 — PERDIDA_PARCIAL

- Ref: `origin/claude/fix-ga-fase78-perimetro-custo-261020-2200` · tip `1b2db4d1` · merge_base `d7af7a67` (1 commit, 2026-10-20)
- PR 2129 (`fix(ci): Fases 7+8 do plano GA75-GA95`), fechada sem merge. Triagem anterior ("JA_NA_MAIN") **não se sustenta**: nenhum marcador GA75–GA95 existe em código na main, só em `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md` (`git grep GA93 origin/main` → só docs).
- Diff completo salvo em `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/branch-2129.diff` (2.031 linhas).

## Propósito
Lote GA75–GA95 do plano de GitHub Actions: perímetro só por script versionado (GA77/GA80), issue de alerta com dedupe (GA78), retenção de artifacts no baseline (GA79), alinhar imagem Go e construí-la no CI (GA87), bump de toolchain cobrindo go/zizmor/shellcheck (GA88), cache de browsers Playwright com restore/save separados (GA89), KPI de Actions que não derruba o hygiene e publica `docs/ci/kpi.json` (GA92/GA93), notificação de `startup_failure` (GA95).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/dependabot.yml` | **OBSOLETA** — adiciona `ossf/scorecard-action*` ao grupo, mas não existe workflow Scorecard na main | `git grep -l scorecard-action origin/main` → só docs + `allowed-actions.json`/baseline; `git ls-tree origin/main:.github/workflows` sem scorecard |
| `.github/toolchain.json` | chave `playwright` **INCORPORADA e superada** (main `1.64.1` > branch `1.63.0`); remoção das duplicatas `actionlint-version`/`-sha256` e `zizmor-version`/`-sha256` **ausente** e acoplada ao GA88 | `git show origin/main:.github/toolchain.json`; `scripts/ci/bump-toolchain.mjs:79` na main ainda lê `actionlint-version` |
| `.github/workflows/branch-hygiene-audit.yml` | **PERDIDA** — sem `continue-on-error` no passo do KPI, sem `KPI_JSON_PATH`, sem upload do kpi.json, sem job `publicar-kpi` | main linhas 63–74 (passo KPI cru); `grep -i kpi` na main não acha `continue-on-error` nem `publicar-kpi` |
| `.github/workflows/ci.yml` | **PERDIDA** — job `egress-image` (GA87) ausente e cache de browsers ainda `actions/cache` combinado (GA89) | `git grep "docker build" origin/main -- .github/workflows/ci.yml` → nenhum; main `ci.yml:472-477` (`actions/cache`, chave `pw-cfw-…-${{ runner.os }}`) |
| `.github/workflows/e2e-logado.yml` | **OBSOLETA** — o passo de cache dos browsers deixou de existir na main | `afd8c7ca3` (2026-11-04, "validar a suíte logada em ambiente isolado", #2717) reescreveu o workflow; `grep ms-playwright` na main → nada |
| `.github/workflows/e2e-talkx.yml` | **PERDIDA** — main ainda com `actions/cache` combinado na chave `pw-c-` | main `e2e-talkx.yml:86-89` |
| `.github/workflows/notifica-falha-main.yml` | **PERDIDA** — main só notifica `conclusion == 'failure'` e monta o corpo com `actions/github-script`; `startup_failure` fica sem issue | `git show origin/main:.github/workflows/notifica-falha-main.yml` (if na linha do job, bloco `script:`) |
| `.github/workflows/vercel-env-cleanup.yml` | **INCORPORADA** | main linhas 47–50: `Setup Node 24` / `node-version: '24'` |
| `infrastructure/preview-egress-proxy/Dockerfile` | **PERDIDA** — divergência viva: main `FROM golang:1.27-alpine` com `go.mod` `go 1.24.0` e `toolchain.json.go = 1.24.x` | `git show origin/main:infrastructure/preview-egress-proxy/Dockerfile:1` e `…/go.mod:3` |
| `scripts/ci/actions-kpi.mjs` | **PERDIDA** — sem `percentil`/`montarKpi`/`gravarKpi`/`mapaNomeArquivo`/`KPI_JSON_PATH` e sem a amostragem do `coletarJobs` | main exporta só até `publicarIssue`; `scripts/ci/render-workflow-docs.mjs:42,160-161` já lê `docs/ci/kpi.json` e cai em `'—'`; `git ls-tree origin/main:docs/ci` sem `kpi.json` |
| `scripts/ci/actions-kpi.unit.mjs` | **PERDIDA** — testes de GA92/GA93 | acompanha o arquivo acima |
| `scripts/ci/allowed-actions.json` | **PERDIDA_PARCIAL** — só faltam `actions/cache/restore` e `actions/cache/save`; o resto é reordenação (a main já tirou `step-security/harden-runner` = GA75 feito e acrescentou `actions/download-artifact`) | `git show origin/main:scripts/ci/allowed-actions.json` |
| `scripts/ci/aplicar-perimetro.mjs` (novo, 155 l.) | **PERDIDA** — ausente na main | `git ls-tree origin/main scripts/ci/aplicar-perimetro.mjs` vazio |
| `scripts/ci/aplicar-perimetro.unit.mjs` (novo, 114 l.) | **PERDIDA** | idem |
| `scripts/ci/bump-toolchain.mjs` | **PERDIDA_PARCIAL** — faltam `go`, `zizmor`, `shellcheck-version` e a chave canônica `actionlint`. **Não portar** a remoção de `playwright`: a main bumpa por aqui e já está em 1.64.1 | main `bump-toolchain.mjs:59-81` |
| `scripts/ci/docker-pins.unit.mjs` (novo, 51 l.) | **PERDIDA** — é o teste que pegaria a divergência 1.27 vs 1.24 que existe hoje; nada na main confere o Dockerfile | `git grep -l preview-egress-proxy origin/main -- scripts` → nenhum |
| `scripts/ci/github-settings-baseline.json` | **OBSOLETA** no geral — o baseline da main é mais novo (`medido_em 2026-11-02` vs `2026-10-16`) e o da branch contradiz a tabela canônica (`docs/agentes/github-ci.md`: 3 required checks, 9 environments, `default_workflow_permissions=write`). Só sobram 2 lacunas reais: `artifact_and_log_retention_days: 14` (GA79) e os 2 padrões `actions/cache/restore|save` | `diff` jq entre `origin/main` e a branch (seções `branch_protection_main.required_status_checks`, `environments`, `workflow_permissions`) |
| `scripts/ci/github-settings-guard.mjs` | **PERDIDA** para GA76 (leitura por GraphQL de `merge.*`), GA78 (issue com dedupe) e GA79 (`/actions/permissions/artifact-and-log-retention`). **GA77** (tirar a restauração automática por PATCH) **contradiz o que a main faz hoje** → decisão do dono | main sem `graphql` (0 ocorrências) e sem `retention`; main `github-settings-guard.mjs:346-360` restaura `strict` e `allow_auto_merge` por PATCH |
| `scripts/ci/github-settings-guard.unit.mjs` | **PERDIDA_PARCIAL** — portar só os testes do que for portado; a main ganhou testes novos depois da base (`verified_allowed`, `github_owned_allowed`, `@*`) | `git diff d7af7a67 origin/main -- scripts/ci/github-settings-guard.unit.mjs` (+73) |
| `scripts/ci/issue-rotativa.mjs` | **PERDIDA** (arquivo intocado na main desde a base) — sem `marcador`/`janelaMs`/`detalhar`, sem `semQuebra`, fecha rotação como `completed` em vez de `not_planned` | main `issue-rotativa.mjs:64` (assinatura sem dedupe) e `:77` (`state_reason: 'completed'`) |
| `scripts/ci/issue-rotativa.unit.mjs` | **PERDIDA** — testes do dedupe/not_planned | idem |

## Veredito
**PERDIDA_PARCIAL.** Entrou na main por outro caminho: GA75 (sai `step-security/harden-runner`), node 24 no `vercel-env-cleanup`, `playwright` no toolchain (versão mais nova), correção do endpoint `selected-actions` + `verified_allowed`/`github_owned_allowed` no guard. O resto (GA76, GA78, GA79, GA80, GA87, GA88, GA89, GA92, GA93, GA95) não está na main. `apagar_branch_seguro = false`.

## Lacunas a recuperar — ordem sugerida

### 1. GA93/GA92 — KPI real (`scripts/ci/actions-kpi.mjs` + `branch-hygiene-audit.yml`)
A main já tem o leitor (`render-workflow-docs.mjs:160-161`), falta o escritor. **Portar só o aditivo**: a main ganhou retry em `pedir` (`tentativas`/`delaysMs`) depois da base — a branch reverte isso; manter o da main.

```js
// GA93: percentil de duracoes (p50/p95 por workflow, em minutos).
export function percentil(valores, p) {
  const xs = [...(valores ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = Math.min(xs.length - 1, Math.floor((p / 100) * xs.length));
  return Math.round(xs[pos] * 10) / 10;
}

export function montarKpi(runs, jobs, { janelaDias = 7, agora = Date.now(), mapaNomeArquivo = {} } = {}) {
  const naJanela = runsNaJanela(runs, { janelaDias, agora });
  const porArquivo = new Map();
  const paraArquivo = (nome) => mapaNomeArquivo[nome] ?? nome;
  for (const run of naJanela) {
    const arq = paraArquivo(run.name || run.workflow_id || '(sem nome)');
    if (!porArquivo.has(arq)) {
      porArquivo.set(arq, { runs: [], conclusoes: {}, canceladosPrecoces: 0, minutosDesperdicados: 0 });
    }
    const e = porArquivo.get(arq);
    e.runs.push(run);
    const c = run.conclusion ?? 'desconhecida';
    e.conclusoes[c] = (e.conclusoes[c] ?? 0) + 1;
    const min = duracaoMinutos(run);
    if (CANCELADOS.has(run.conclusion)) {
      e.minutosDesperdicados = Math.round((e.minutosDesperdicados + min) * 10) / 10;
      if (min < 1) e.canceladosPrecoces += 1;
    }
  }
  const saidas = {};
  for (const [arq, e] of porArquivo) {
    const duracoes = e.runs.map(duracaoMinutos);
    const falhas = e.runs.filter((r) => FALHAS.has(r.conclusion)).length;
    saidas[arq] = {
      custo_semana_min: Math.round(duracoes.reduce((a, b) => a + b, 0) * 10) / 10,
      taxa_falha_7d: e.runs.length ? Math.round((falhas / e.runs.length) * 1000) / 10 : 0,
      cancelados_precoces: e.canceladosPrecoces,
      minutos_desperdicados: e.minutosDesperdicados,
      p50_min: percentil(duracoes, 50),
      p95_min: percentil(duracoes, 95),
      causas: e.conclusoes,
    };
  }
  return saidas;
}

export async function gravarKpi(caminho, kpi) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(kpi, null, 2)}\n`);
}

// GA92: 1 GET por run estourava o limite de 1.000/h do GITHUB_TOKEN (1.014 runs em 7 d).
const COM_FALHA = new Set([...FALHAS, ...CANCELADOS]);
export async function coletarJobs(
  runs,
  { repo, token, porPagina = POR_PAGINA, maxPaginas = 100, maxRuns = 200, pedir: buscar = pedir } = {},
) {
  const alvos = (runs ?? []).filter((r) => COM_FALHA.has(r.conclusion)).slice(0, maxRuns);
  if ((runs ?? []).length > alvos.length) {
    console.error(`::notice::coletarJobs: ${alvos.length} de ${runs.length} runs (so falha/cancelamento, teto ${maxRuns})`);
  }
  // ... resto igual, iterando `alvos` em vez de `runs ?? []`
}
```
No `principal()`: trocar o `slice(0, 50)` pela chamada sem corte, montar `mapaNomeArquivo` lendo o `name:` de cada `.github/workflows/*.yml` e, com `process.env.KPI_JSON_PATH`, chamar `gravarKpi`. No `branch-hygiene-audit.yml`: `continue-on-error: true` + `KPI_JSON_PATH` no passo do KPI, upload do artifact e o job `publicar-kpi` (PR `automation/kpi`, merge manual) — hunk completo em `branch-2129.diff`.

### 2. GA89 — cache de browsers Playwright (PR só restaura, main salva)
Pré-requisito: acrescentar `actions/cache/restore` e `actions/cache/save` a `scripts/ci/allowed-actions.json` **e** a `selected_actions_patterns` do baseline (senão o job morre com `startup_failure`), e aplicar o mesmo no perímetro vivo. Aplicar em `ci.yml` (chave `pw-cfw-`) e `e2e-talkx.yml` (chave `pw-c-`); **não** em `e2e-logado.yml` (passo não existe mais).

```yaml
      - name: 💾 Restaura cache dos browsers Playwright
        id: pw-cache
        uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: pw-cfw-${{ hashFiles('bun.lock') }}-${{ runner.os }}-${{ github.run_id }}
          restore-keys: |
            pw-cfw-${{ hashFiles('bun.lock') }}-${{ runner.os }}-
      # ...instalação dos browsers...
      - name: 💾 Salva cache dos browsers Playwright (só push na main)
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: pw-cfw-${{ hashFiles('bun.lock') }}-${{ runner.os }}-${{ github.run_id }}
```

### 3. GA95 — `notifica-falha-main.yml`
Trocar `if: ${{ github.event.workflow_run.conclusion == 'failure' }}` por `… == 'failure' || … == 'startup_failure'` e substituir o `actions/github-script` por `gh` + `jq` (env `WF_*` a partir de `github.event.workflow_run.*`, incluindo `WF_URL: html_url` e `WF_CONCLUSAO`). Hunk completo (72 linhas) em `branch-2129.diff`.

### 4. GA78 — `scripts/ci/issue-rotativa.mjs` (+ unit)
Assinatura nova: `abrirOuRotacionar({ gh, owner, repo, label, title, body, marcador = null, janelaMs = 0, autor = null, detalhar = false })`; dedupe por marcador olhando as 2 últimas páginas de comentários (ignora marcador colado por terceiro — repo público), rotação fecha como `state_reason: 'not_planned'` e `semQuebra` nos valores vindos da API:
```js
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');
```
Compatível com os chamadores atuais (todos os parâmetros novos são opcionais).

### 5. GA79 + GA76 — `github-settings-guard.mjs`
- GA79: `artifact_and_log_retention_days: 14` no baseline + checagem em `GET /repos/:o/:r/actions/permissions/artifact-and-log-retention` (403 → "não verificável", não regressão).
- GA76: ler `merge.*` por GraphQL (`repository { autoMergeAllowed squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed deleteBranchOnMerge }`) antes de declarar ponto cego; o REST omite os campos para token sem `push/admin`.
- **Não** reverter o que a main ganhou depois da base: endpoint `/actions/permissions/selected-actions`, normalização `@*`, `verified_allowed`, `github_owned_allowed`, `semQuebra` no erro final.

### 6. GA87/GA88 (baixo) — Go e bump de toolchain
- `docker-pins.unit.mjs` (arquivo novo, 51 linhas, colar inteiro do `branch-2129.diff`) + alinhar o `Dockerfile` do `preview-egress-proxy` a `go 1.24` **resolvendo o digest atual** (o da branch é de 20/10) + job `egress-image` no `ci.yml` (`docker build`, sem push, não-required).
- `bump-toolchain.mjs`: acrescentar `go`, `zizmor`, `shellcheck-version`; manter `playwright` na lista (a main depende dele).
- Dedupe do `toolchain.json` (`actionlint-version`, `zizmor-version` e os SHAs) só junto com a troca para a chave canônica `actionlint` em todos os leitores.

### 7. GA80 / GA77 — chamar o dono antes
`scripts/ci/aplicar-perimetro.mjs` + unit são recuperáveis (dry-run por padrão, `--apply --confirm=APLICAR-PERIMETRO`, token `administration:write`), mas **o baseline da branch está desatualizado**: aplicado com `--apply` ele mudaria os required checks (de `✅ CI Gate`/`🏗️ Build`/`🔎 TypeCheck` para 6 outros), apagaria `copilot`/`Preview`/`Production` e poria `default_workflow_permissions=read`. E o GA77 tira do guard a restauração automática de `strict`/`allow_auto_merge` que a main faz hoje (`github-settings-guard.mjs:346-360`) — mudança de política de perímetro, contrária ao comportamento vigente. Portar o script **sem** o baseline da branch e **sem** o GA77, ou decidir com o dono.

## Não portar
- `.github/dependabot.yml` (scorecard não existe mais).
- `github-settings-baseline.json` da branch, exceto `artifact_and_log_retention_days` e os 2 padrões de cache.
- `playwright: 1.63.0` no toolchain e `playwright@1.63.0` nos workflows (main em 1.64.1).
- Reversão do retry em `actions-kpi.mjs#pedir`.
- GA89 em `e2e-logado.yml`.

## Verificação adversarial

**Parecer: CONCORDO com PERDIDA_PARCIAL.** Tentei refutar cada lacuna; todas as de valor ≥ médio continuam fora da `main` (`origin/main` = `dac285f62`), nenhuma foi removida de propósito, e as APIs que elas usam existem hoje. Três correções ao dossiê (duas rebaixam uma lacuna, uma acrescenta pré-requisito).

### Confirmado (não está na main, não foi removido de propósito)
- **KPI (GA93)** — `origin/main:scripts/ci/render-workflow-docs.mjs:42,160-161` lê `docs/ci/kpi.json`; `git ls-tree origin/main docs/ci/` não tem o arquivo; `origin/main:scripts/ci/actions-kpi.mjs` exporta até `publicarIssue` e nada mais (`git grep -ln 'montarKpi\|gravarKpi\|KPI_JSON_PATH' origin/main` → **vazio**). Efeito vivo: `docs/ci/README.md` da main tem **21 linhas com `| — | — |`**. `git log -S'montarKpi' origin/main` → vazio (nunca existiu, não foi revertido).
- **continue-on-error no passo do KPI (GA92)** — `origin/main:.github/workflows/branch-hygiene-audit.yml:63-75`: passo cru, sem `continue-on-error`, antes do "Gerar relatorio" → falha do KPI ainda derruba o hygiene.
- **GA89 (cache Playwright)** — main ainda com `actions/cache` combinado: `ci.yml:472-477` (`pw-cfw-…-${{ runner.os }}`) e `e2e-talkx.yml:85-90` (`pw-c-`). **Evidência ao vivo (MCP GitHub, 15/11)**: `get_actions_cache_usage` → `active_caches_size_in_bytes: 10.851.535.933` (**10,85 GB**, acima do teto de 10 GB do repo) em 76 caches; `list_actions_caches key=pw-` → 23 caches, **20 em `refs/pull/N/merge`**, somando **~7,0 GB** (14 × ~293 MB + 3 × ~505 MB + 520/519/306 MB). Ou seja: o desperdício é **maior** que os 2,6 GB do dossiê e já está expulsando por LRU o cache da `main` (`pw-cfw-…` de `refs/heads/main`). Lacuna de valor **alto**, não médio.
- **GA95 (`startup_failure`)** — `git grep -n startup_failure origin/main -- .github/ scripts/` → **só** `scripts/ci/actions-kpi.mjs:20`. O `notifica-falha-main.yml` da main ainda é `if: … conclusion == 'failure'` com `actions/github-script`.
- **GA79/GA76 no guard** — `git grep -c 'graphql\|retention\|artifact-and-log' origin/main -- scripts/ci/github-settings-guard.mjs` → **0**; baseline da main (`medido_em 2026-11-02`) sem chave `*retention*`.
- **Arquivos novos** — `git ls-tree origin/main scripts/ci/aplicar-perimetro.mjs scripts/ci/aplicar-perimetro.unit.mjs scripts/ci/docker-pins.unit.mjs` → vazio; `git log --all --diff-filter=D` neles → vazio.
- **Divergência Go viva** — `origin/main:infrastructure/preview-egress-proxy/Dockerfile:1` `golang:1.27-alpine` vs `go.mod:3` `go 1.24.0` e `toolchain.json` `"go": "1.24.x"`. `git grep -rl preview-egress-proxy origin/main -- .github/workflows scripts` → **nenhum**: nada compila, testa ou publica a imagem (só `dependabot.yml` e docs). Confirma a lacuna **e** confirma o valor baixo que o dossiê deu: é componente dormente.
- **`allowed-actions.json`** — main tem só `actions/cache`; `restore`/`save` ausentes.

### Correção 1 — GA78 (`issue-rotativa.mjs`) é OBSOLETA, não PERDIDA (rebaixar o item 4)
O dedupe já existe na main, por outro caminho, em **cada consumidor**, e `issue-rotativa.mjs` não tem **nenhum** importador:
- `git grep -rln issue-rotativa origin/main` → só `scripts/ci/issue-rotativa.mjs`, seu próprio `.unit.mjs` e docs. **Módulo morto na main.**
- `origin/main:scripts/ci/github-settings-guard.mjs:60-61,379-429`: `MARCADOR(assinatura)`, `registroMaisRecenteCom`, `escritoPeloGuard`, `semQuebra` e janela `6 h / 7 dias` — exatamente o comportamento do GA78, inclusive a defesa contra marcador colado por terceiro (PR #1920).
- `origin/main:.github/workflows/types-sync.yml:526-605`: dedupe inline por `<!-- causa:… -->` com janela de 6 h.
- `origin/main:scripts/ci/marcador-specs.mjs` (+ unit) cobre o alerta da suíte logada (E83/E44).
Portar o dedupe/`detalhar`/`janelaMs` para `issue-rotativa.mjs` hoje = **código que ninguém chama**. Sobra só o cosmético (`state_reason: 'not_planned'` na rotação, `semQuebra` no log) num módulo sem consumidor. Recomendação: **não portar** o item 4, ou portar apenas quando algum workflow voltar a importar o módulo.

### Correção 2 — a amostragem do GA92 não é mais necessária (e pode piorar)
`origin/main:scripts/ci/actions-kpi.mjs:231` já corta em `.slice(0, 50)` e `:132-142` já tem retry com backoff (`tentativas = 4`, `delaysMs [5s,10s,20s]`). O teto de 1.000 req/h está endereçado. A versão da branch troca o corte por `maxRuns = 200` + filtro de falhas — com 200 runs com falha **sobe** de 50 para até 200 chamadas. Portar do GA92 só: `continue-on-error`, `KPI_JSON_PATH`, upload do artifact e o job `publicar-kpi`; manter `slice(0, 50)` e o retry da main.

### Correção 3 — GA89 tem um pré-requisito que o dossiê não lista (e que a própria branch não resolveu)
`origin/main:scripts/ci/workflow-contracts.unit.mjs:255` exige, no passo do cache dos browsers, `uses: actions/cache@<40 hex>` **junto com** `~/.cache/ms-playwright`; `:406` (`USES_CACHE`) e `:450` repetem a exigência por job. `actions/cache/restore@…` **não casa** com essa regex. A mesma linha já existia no merge-base (`d7af7a67:scripts/ci/workflow-contracts.unit.mjs:255`) e a branch **não toca** o arquivo (`git diff --name-only d7af7a67 1b2db4d1 | grep workflow-contracts` → 0). Portanto o GA89 como está na branch quebra o contrato E68 da main: o port tem que atualizar `workflow-contracts.unit.mjs` também.
Nota sobre o pré-requisito que o dossiê cita: `origin/main:scripts/ci/allowed-actions.json` tem `"github_owned_allowed": true`, o que já pode liberar `actions/cache/restore|save` sem padrão novo — mas o baseline da main lista `github/codeql-action/init` e `…/analyze` separadamente, indício de que subpath precisa de padrão próprio. Conferir o `selected-actions` vivo antes de afirmar `startup_failure`.

### Itens que eu também tentei derrubar e não caíram
- `.github/dependabot.yml` (scorecard): confirmo **OBSOLETA** — `git ls-tree --name-only origin/main .github/workflows/ | grep -i scorecard` → nenhum workflow, embora `ossf/scorecard-action` continue no `allowed-actions.json` e no baseline.
- `e2e-logado.yml`: confirmo **OBSOLETA** para o GA89 — `origin/main:.github/workflows/e2e-logado.yml:119-123` só tem cache do Bun; o passo de browsers saiu em `17a43ddea` (#2889, 09/11, "browsers já instalados no runner"). Remoção **de propósito**: não reintroduzir.
- `toolchain.json`: main em `playwright 1.64.1` > branch `1.63.0`; as duplicatas `actionlint-version`/`zizmor-version` continuam na main e `bump-toolchain.mjs` ainda as lê → a dedupe só junto com a chave canônica, como o dossiê diz.

### Veredito da verificação
`PERDIDA_PARCIAL` mantido. **Não apagar a branch**: ela é a única fonte de `aplicar-perimetro.mjs` (+unit), `docker-pins.unit.mjs`, do escritor do KPI e dos hunks de GA89/GA95/GA76/GA79. Ordem de recuperação por valor, revisada: **1)** GA89 (10,85 GB de cache, ~7 GB preso em PRs, main sendo expulsa) — com atualização do `workflow-contracts.unit.mjs`; **2)** GA93 + `continue-on-error` (21 linhas de `—` no `docs/ci/README.md`); **3)** GA95; **4)** GA79+GA76 no guard; **5)** GA87/GA88; **6)** GA80 com o dono. Item 4 do dossiê (GA78) sai da fila.
