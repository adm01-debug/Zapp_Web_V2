# Dossiê — claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023 (PR #2197)

- Tip `e1cf8004d` (2026-10-23), merge-base `351ccb2a6`, 2 commits, 12 arquivos (+274/-35). Só CI/scripts; nenhuma migration, edge ou front funcional.
- PR #2197 fechada em 2026-10-31 com "delta líquido zero" (hipótese; abaixo o que de fato está e não está na main `dac285f62`, 2026-11-15).
- Review Qodo na PR apontou: `docker-shim` com resíduo Python (`""")`, `edit(S,`) que quebra o parse do bash; testes GA54 duplicados; `detectarLote` conta runs e não pushes (falso positivo em `main`).

## Propósito
Lote de pequenos ajustes de CI (GA49–GA66/GA70): fila de merge (`fila-merge.mjs`), alerta de lote de pushes no KPI do Actions, higiene de `types-sync.yml`, CodeQL diário, publicação do relatório semanal, docker-shim do db-guard, lint config/baseline, mock de teste.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/ci/fila-merge.mjs` (GA49/GA50) | **OBSOLETA** — arquivo e o workflow que o usava foram removidos de propósito | `git log --diff-filter=D origin/main -- scripts/ci/fila-merge.mjs` → `41853318c` 2026-11-14 "pacote 6" apaga `fila-merge.mjs` (-204), `fila-merge.unit.mjs` (-167) e `.github/workflows/auto-update-pr-branch.yml` (-215); corpo do commit: com `strict=true` a fila é O(N²) "que não converge" → PRs passam a entrar em pacotes. `git ls-tree origin/main scripts/ci/` não lista fila-merge. |
| `.github/workflows/codeql.yml` cron diário (GA62) | **INCORPORADA** | `origin/main:.github/workflows/codeql.yml:23` `- cron: '30 9 * * *' # diario 06:30 BRT` (commit `b94be0a2c` 2026-11-01 "GA62 … codeql diário"). |
| `.github/workflows/codeql.yml` `needs: [analyze]` (GA59) | **OBSOLETA** | Motivação era o veredito do check fechar antes do JS/TS na PR; o CodeQL não roda mais em PR (`codeql.yml:17-24`: só `workflow_dispatch` + `schedule`, "saiu do PR" 16/10). Main mantém `analyze-actions` independente de propósito (`codeql.yml:66-73`); Qodo também apontou que `needs` sem `if` pula a varredura de actions quando JS/TS falha. |
| `.github/workflows/branch-hygiene-audit.yml` (GA64) | **INCORPORADA em forma mais estrita / parte rejeitada** | `origin/main:…/branch-hygiene-audit.yml:181` `if: ${{ !cancelled() && steps.relatorio.outcome == 'success' }}` com comentário "Se a coleta de branches falhou/cancelou, nao publica relatorio incompleto" (commit `b46f5d291` 2026-11-04). O `!cancelled()` entrou; "publicar mesmo se o relatório falhou" foi decidido ao contrário. |
| `.github/workflows/types-sync.yml` GA61 `!scripts/db-audit/known-violations.json` em `paths` | **PERDIDA (baixo)** | `origin/main:…/types-sync.yml:27-35` só nega `grants-baseline.json`; `known-violations.json` está no `add-paths` do PR de sync (`:668`) → merge do PR de sync redispara o workflow (mitigado pelo debounce E17 e pelo gate `schema_changed`). |
| `types-sync.yml` GA61 concurrency (dispatch com run próprio) | **PERDIDA (baixo)** | `:53` ainda `group: types-sync-${{ github.ref }}-${{ github.event_name == 'schedule' && github.run_id \|\| 'push' }}`. |
| `types-sync.yml` GA61 R5 `Job summary if: !cancelled()` | **PERDIDA (baixo)** | `:766-767` `- name: Job summary` / `if: always()`. |
| `types-sync.yml` GA63 comentário sobre permissões | **nenhum** | Main já tem `actions: write` com justificativa própria (`:375-378` "Necessaria para aprovar os checks da PR aberta por este job"). Só comentário. |
| `.github/actionlint.yaml` (GA60) | **PERDIDA (baixo), NÃO VERIFICADO se o YAML parseia** | Main mantém o ignore `could not parse as YAML` para `branch-hygiene-audit.yml` (`actionlint.yaml:6-8`, desde `4dadbb74d`). `actionlint` não está instalado neste ambiente; a remoção do ignore só é segura após rodar `actionlint` na main. |
| `.gitignore` `node_modules` | **INCORPORADA** (a branch adicionava duplicata) | `origin/main:.gitignore:45` `node_modules`. |
| `eslint.config.js` ignores `Zapp_fase456/**`, `zapp-worktrees/**` | **nenhum** | Diretórios não existem no repo (`ls` falha); eram worktrees locais do autor. Main `eslint.config.js:13` `{ ignores: ["dist", ".claude/worktrees/**"] }`. |
| `scripts/ci/eslint-baseline.json` | **nenhum** (artefato gerado) | Main regenerou 3× depois (`cf93115b2` 2026-11-14, `cb6576b2a`, `77d5cd471`); `eslintConfigSha256` da branch não bate com a config da main; a violação `useFilesContainerColumns.ts:277` não existe na main (arquivo tem `useLayoutEffect(..., [ref])` em `:80-86`, baseline da main tem 0 ocorrências). |
| `scripts/ci/actions-kpi.mjs` `detectarLote`/`tabelaLote` (GA54) | **PERDIDA (baixo)** | `git show origin/main:scripts/ci/actions-kpi.mjs \| grep -n detectarLote` → vazio; nenhum alerta de lote/R6 no KPI. Ainda chamado por `branch-hygiene-audit.yml:74`. Design com defeitos apontados na PR (conta runs, não pushes; janela 24 h para caller semanal; promete comentário em PR que não existe). |
| `scripts/ci/actions-kpi.unit.mjs` testes GA54 | **PERDIDA (baixo)** | Ausentes na main; na branch os 2 testes estão duplicados literalmente (colar 1 cópia). |
| `scripts/db-audit/docker-shim` GA66 | **INCORPORADA com texto diferente e mais forte** | Main `docker-shim:80-86`: `if _svc … CREATE DATABASE …; then printf shimid else … exit "$status"` (CREATE falho não sai 0); `:170-173`: `if ! old="$(cat -- "$STATE/$cname.roles" …)"; then … exit 1` (fail closed sem snapshot); `:179-182` idem para listar roles. Commit `b46f5d291` 2026-11-04. |
| `docker-shim` GA70 (doc do `.db`/`EXPECTED_DB`) | **OBSOLETA / nenhum** | `git grep EXPECTED_DB origin/main -- scripts/` → vazio (convenção não existe); o hunk da branch é inválido em bash (`"""`), `edit(S,` — resíduo de script Python). |
| `src/pages/__tests__/ChatPopup.rolagem-mensagem-nova.test.tsx` mock `generateCorrelationId` | **nenhum** (desnecessário na main) | Árvore do teste não importa `invokeEdge`/`retry` (únicos consumidores: `src/lib/invokeEdge.ts:34`, `src/lib/retry.ts:1`); arquivo de teste foi tocado 3× depois na main (`61a973da6` "corrige mocks de logger", `a5760922c`, `9727aaedd`) sem precisar do mock e roda na CI. Execução local NÃO VERIFICADA (sem `node_modules` neste clone). |

## Veredito
**PERDIDA_PARCIAL** — núcleo do lote (fila-merge, docker-shim, codeql diário, branch-hygiene) já está na main ou foi deliberadamente superado; sobram 5 hunks de valor **baixo** (types-sync GA61 ×3, actionlint GA60, KPI GA54). `apagar_branch_seguro = false` só por haver trabalho não incorporado (tudo colado abaixo; a branch não precisa ser relida).

## Lacunas a recuperar (hunks)

### 1. `.github/workflows/types-sync.yml` — GA61 (3 hunks, baixo)
```diff
@@ paths (após a linha '!scripts/db-audit/grants-baseline.json')
+      # GA61: known-violations.json tambem e artefato gerado pelo proprio sync
+      # (o merge do sync redisparava o workflow a toa).
+      - '!scripts/db-audit/known-violations.json'
@@ concurrency (main :53)
-  group: types-sync-${{ github.ref }}-${{ github.event_name == 'schedule' && github.run_id || 'push' }}
+  # GA61: dispatch e schedule tem run proprio (antes o dispatch caia no grupo
+  # 'push' e era cancelado/fundido com o push da main).
+  group: types-sync-${{ github.ref }}-${{ github.event_name == 'push' && 'push' || github.run_id }}
@@ Job summary (main :766-767)
       - name: Job summary
-        if: always()
+        # GA61 (R5): cancelado nao pinta resumo/veredito — always() publicava
+        # summary ate de run cancelado.
+        if: ${{ !cancelled() }}
```
Guard a reler antes: `scripts/ci/types-sync-workflow.unit.mjs`, `scripts/ci/workflow-invariants.mjs`.

### 2. `.github/actionlint.yaml` — GA60 (baixo; condicionado a `actionlint` passar na main)
```diff
-  ".github/workflows/branch-hygiene-audit.yml":
-    ignore:
-      - 'could not parse as YAML'
+  # GA60: ignore removido — se o actionlint voltar a reclamar de parse, corrigir o YAML.
```

### 3. `scripts/ci/actions-kpi.mjs` + `actions-kpi.unit.mjs` — GA54 (baixo; portar só com as correções do review)
Inserir após `tabelaLentos` e chamar em `corpoDoKpi`:
```js
export const LIMITE_PUSHES_LOTE = 15;
export const JANELA_LOTE_HORAS = 24;
export function detectarLote(runs, { limite = LIMITE_PUSHES_LOTE, janelaHoras = JANELA_LOTE_HORAS, agora = Date.now() } = {}) {
  const corte = agora - janelaHoras * 3600 * 1000;
  const porBranch = new Map();
  for (const run of runs ?? []) {
    const inicio = Date.parse(run.run_started_at ?? run.created_at ?? '');
    if (!Number.isFinite(inicio) || inicio < corte) continue;
    const branch = run.head_branch ?? '(sem branch)';
    porBranch.set(branch, (porBranch.get(branch) ?? 0) + 1);
  }
  return [...porBranch.entries()].filter(([, n]) => n > limite)
    .map(([branch, pushes]) => ({ branch, pushes })).sort((a, b) => b.pushes - a.pushes);
}
export function tabelaLote(lotes) {
  if (!lotes.length) return '';
  return ['### Lotes de push (> 15 runs no mesmo branch em 24 h)', '',
    ...lotes.map((l) => `- \`${l.branch}\`: ${l.pushes} runs — prefira acumular num unico push (R6).`), ''].join('\n');
}
// em corpoDoKpi: const lotes = detectarLote(runs, { agora }); … tabelaLote(lotes),
```
Correções obrigatórias (review Qodo na #2197): filtrar `event in (push, pull_request)`, contar `head_sha` distintos por branch (não runs), ignorar `main`; janela compatível com o caller semanal (`branch-hygiene-audit.yml`); não prometer comentário em PR. Testes (uma cópia só):
```js
test('GA54: 20 runs no mesmo branch em 24 h dispara o alerta de lote', () => {
  const agora = Date.parse('2026-10-03T12:00:00Z');
  const runs = Array.from({ length: 20 }, (_, i) => ({ name: 'CI', conclusion: 'success', head_branch: 'claude/lote-grande',
    run_started_at: new Date(agora - (i + 1) * 3600 * 1000).toISOString(), updated_at: new Date(agora - i * 3600 * 1000).toISOString() }));
  const lotes = detectarLote(runs, { agora });
  assert.equal(lotes.length, 1); assert.equal(lotes[0].branch, 'claude/lote-grande'); assert.equal(lotes[0].pushes, 20);
  assert.match(corpoDoKpi(runs, [], { agora, janelaDias: 7 }), /Lotes de push/);
});
test('GA54: abaixo do limite (15) ou fora da janela nao ha alerta', () => {
  const agora = Date.parse('2026-10-03T12:00:00Z');
  const runs = Array.from({ length: 15 }, (_, i) => ({ name: 'CI', conclusion: 'success', head_branch: 'claude/no-limite',
    run_started_at: new Date(agora - (i + 1) * 3600 * 1000).toISOString(), updated_at: new Date(agora - i * 3600 * 1000).toISOString() }));
  assert.deepEqual(detectarLote(runs, { agora }), []);
  const velhos = Array.from({ length: 30 }, (_, i) => ({ name: 'CI', conclusion: 'success', head_branch: 'claude/velho',
    run_started_at: new Date(agora - 3 * 86400 * 1000 - i * 3600 * 1000).toISOString(), updated_at: new Date(agora - 3 * 86400 * 1000).toISOString() }));
  assert.deepEqual(detectarLote(velhos, { agora }), []);
});
```

## Não portar
- `fila-merge.mjs` (removido com o workflow em `41853318c`), `needs: [analyze]` no CodeQL, "publicar mesmo com relatório falho" no branch-hygiene (decisão contrária em `b46f5d291`), `docker-shim` (versão da branch é inválida; main já cobre GA66), `eslint-baseline.json`, ignores de worktrees locais, `node_modules` no `.gitignore`, mock `generateCorrelationId`.

## Verificação adversarial

Parecer: **concordo** com `PERDIDA_PARCIAL` (main `dac285f62`, 2026-11-15). Tentei refutar por dois caminhos — provar que a main já cobre as 5 lacunas, e provar que foram removidas de propósito. Nenhum pegou.

### As 5 lacunas continuam ausentes da main (verificado arquivo por arquivo)
| Lacuna | Prova na main |
|---|---|
| types-sync `!known-violations.json` em `paths` | `origin/main:.github/workflows/types-sync.yml:31-37` nega só `grants-baseline.json`; `known-violations.json` só aparece no `add-paths` (`:668`), e o gatilho inclui `scripts/db-audit/**` → merge do PR de sync redispara. |
| types-sync concurrency para `dispatch` | `:53` `group: types-sync-${{ github.ref }}-${{ github.event_name == 'schedule' && github.run_id \|\| 'push' }}` — dispatch continua caindo no grupo `push`. |
| types-sync Job summary `!cancelled()` | `:766-767` `- name: Job summary` / `if: always()`. Coerente com a regra própria do repo (R5, `scripts/ci/workflow-invariants.mjs:8-9`), que o guard só aplica a job-level em `ci.yml` (`:92`) — o passo escapa. |
| actionlint: remover ignore de parse | `origin/main:.github/actionlint.yaml:6-8` mantém `'could not parse as YAML'`; nenhum guard depende dele (`git grep "could not parse as YAML" origin/main -- scripts/ .github/` → só a própria linha 8). `pyyaml` parseia `branch-hygiene-audit.yml` da main sem erro (indício de ignore obsoleto; `actionlint` não instalado → **NÃO VERIFICADO** com a ferramenta real). |
| KPI `detectarLote`/`tabelaLote` + 2 testes | `git show origin/main:scripts/ci/actions-kpi.mjs \| grep detectarLote\|tabelaLote\|LIMITE_PUSHES\|'Lotes de push'` → vazio; `actions-kpi.unit.mjs` sem `GA54`. |

### Não foram removidas de propósito
`git log -S"known-violations.json'" origin/main -- .github/workflows/types-sync.yml` → vazio; `git log -S"github.event_name == 'push' && 'push'"` → vazio; `git log -S"detectarLote" origin/main` → vazio; `.github/actionlint.yaml` tem um único commit (`4dadbb74d`), que **introduziu** o ignore. Ou seja: nunca estiveram na main, logo não houve reversão.

### Ainda encaixam no código atual
`types-sync.yml`, `.github/actionlint.yaml`, `scripts/ci/actions-kpi.mjs` (com `corpoDoKpi` `:115-120` e `tabelaLentos` `:102`) e `actions-kpi.unit.mjs` existem na main; o KPI é chamado por `branch-hygiene-audit.yml:74` e as runs vêm de `/actions/runs` (`actions-kpi.mjs:161`), que traz `head_branch` — a função portaria sem adaptação de API.

### Tentei derrubar os "não portar" e eles se sustentam
- `fila-merge.mjs`: `git log --diff-filter=D origin/main` → `41853318c` (2026-11-14, "pacote 6"); `git ls-tree origin/main scripts/ci/ | grep fila` → vazio. Remoção deliberada.
- `docker-shim`: main `:77-86` (`CREATE` falho → `exit "$status"`) e `:168-181` (snapshot ausente/ilegível → `exit 1`; falha ao listar roles → `exit 1`) cobrem GA66 com mais força. O hunk da branch termina em `rm -f … "$STATE/$cname.roles""")` + `edit(S,` — resíduo de script Python, **bash inválido**: portar quebraria o shim.
- `codeql.yml`: `:17-24` só `workflow_dispatch` + `schedule` com `cron: '30 9 * * *'` → cron já incorporado e `needs: [analyze]` sem propósito.
- `branch-hygiene-audit.yml`: `:178-181` `if: ${{ !cancelled() && steps.relatorio.outcome == 'success' }}` com comentário "nao publica relatorio incompleto" → `!cancelled()` incorporado e a parte "publicar mesmo com relatório falho" decidida ao contrário.
- Ruído confirmado: `.gitignore:45` já tem `node_modules`; `eslint.config.js:13` sem os worktrees locais e `Zapp_fase456/`, `zapp-worktrees/` não existem no repo (`ls` falha); `eslint-baseline.json` da main tem **0** ocorrências de `useFilesContainerColumns` e o hook tem deps `[ref]` (`src/hooks/chat/useFilesContainerColumns.ts:80-85`) → a violação do baseline da branch não existe mais; mock `generateCorrelationId` ausente do mock de logger da main (`ChatPopup.rolagem-mensagem-nova.test.tsx:111-115`) e o teste roda verde na CI depois de 3 commits.

### Ressalvas (não mudam o veredito)
1. `detectarLote` conta runs de **qualquer** evento e não ignora `main` — na main (push + schedules diários) acusaria lote falso. Portar só com as correções já listadas no dossiê.
2. GA60 continua condicionado a rodar `actionlint` na main (não instalado aqui).
3. Os 4 arquivos de workflow caem em "chame o dono" por AGENTS.md: a PR de recuperação fica aberta.

`apagar_branch_seguro = false` confirmado: há 5 hunks de valor baixo nunca incorporados (≈87 linhas), todos colados acima — a branch em si pode ser descartada **depois** da PR de recuperação, não antes.
