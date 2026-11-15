# Dossiê — claude/fix-ci-E69-E71-draft-filter-261101-1830 (PR #2503, fechada 2026-11-01)

**Veredito: PERDIDA_PARCIAL** · confiança alta · apagar branch: NÃO (ainda há trabalho não portado).

## Propósito
`git log 1252bb5a..1b5eb7ca`: 2 commits de código + 1 docs + 3 merges de main.
- **E69**: `build` deixa de esperar `typecheck` (`needs: [unit-tests]`) — typecheck e build em paralelo (~2 min/PR).
- **E71**: `if: github.event.pull_request.draft != true` em `security` e `e2e` (draft não roda audit ~20 min nem Playwright ~45 min); adiciona `ready_for_review` aos `types` do `pull_request`.
- Teste `scripts/ci/workflow-contracts.unit.mjs` reescrito para o novo grafo (build sem typecheck; ci-gate ainda espera typecheck e build).
- Docs: aritmética do inventário (19→20).

## Arquivo × achado × evidência

| Arquivo / hunk | Achado | Evidência |
|---|---|---|
| `.github/workflows/ci.yml` — `types: [opened, synchronize, reopened, ready_for_review]` | **INCORPORADA** | `origin/main:.github/workflows/ci.yml:21-23` (com comentário explicativo); commit `b2fed615c ci: pull_request do ci.yml também dispara em ready_for_review (#2858)` |
| `.github/workflows/ci.yml` — `build.needs: [unit-tests]` (tira `typecheck`) | **PERDIDA** (valor baixo) | main `ci.yml:229` ainda `needs: [typecheck, unit-tests]`; último commit que tocou isso: `f1e9e325b 2026-10-16` (anterior à branch) — nenhuma rejeição deliberada posterior. Porém o invariante codificado em main `scripts/ci/workflow-contracts.unit.mjs:561-565` ("E69: o build continua atrás do lint E do test") exige typecheck como ancestral de build — portar exige mudar o teste junto (hunk 5). |
| `.github/workflows/ci.yml` — `if: draft != true` em `security` | **PERDIDA, mas incompatível como está** (valor médio) | main `ci.yml:296-300` sem `if`. O `ci-gate` da main (`ci.yml:410,427`) exige `needs.security.result == "success"` estritamente (só unit-tests e build têm isenção para `skipped` em draft, linhas 422/425). Na branch o gate aceitava `skipped` (branch `ci.yml:327-332` só falhava em `failure`/`cancelled`) — premissa do corpo da PR já não vale. Portar literal = **ci-gate vermelho em todo PR draft**. Precisa adicionar ao gate a mesma isenção `draft && skipped` para `security`. |
| `.github/workflows/ci.yml` — `if: draft != true` em `e2e` | **PERDIDA** (valor médio) | main `ci.yml:440-444` sem `if`. `e2e` não está em `ci-gate.needs` (`ci.yml:410`) nem nos required checks (`scripts/ci/github-settings-baseline.json`: só CI Gate, Build, TypeCheck) → portável sozinho, sem efeito em gate. Economia: até 45 min de runner por push em PR draft. W45 (`578e5671c`, #2046) só cobriu unit-tests e build (diff: +2 linhas), apesar do título citar security/e2e. |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:80` — "19 → 20 no total" | **OBSOLETA** | main reescreveu o parágrafo (linhas 78-80): "**21** arquivos YAML em `.github/workflows/`" medido 2026-11-14 e **não conta mais workflows dinâmicos**; `git ls-tree origin/main .github/workflows/ | wc -l` = 21. A aritmética 17+3 não existe mais. |
| `scripts/ci/workflow-contracts.unit.mjs:561-565` — teste E69 reescrito | **PERDIDA, acoplada ao hunk `build.needs`** | main mantém a versão antiga (afirma `anc.has('typecheck')`). O teste da branch falharia hoje na main (build ainda espera typecheck). Só faz sentido portar junto com a mudança do `needs`. |

## Por que a triagem 2804 disse OBSOLETA
Hipótese não confirmada: só o `ready_for_review` (1 de 4 mudanças no YAML) entrou via #2858; docs ficou obsoleto. E69 (paralelizar build) e E71 nos jobs `security`/`e2e` não entraram nem foram substituídos por outra abordagem — no PLANO em main (`docs/audits/PLANO_...md:765,771`) E69 e E71 continuam `[ ]`.

## Lacunas a recuperar (ordem sugerida)

### 1. `e2e` pular em draft (portável isolado, valor médio)
`.github/workflows/ci.yml`, job `e2e` (main linha ~443, após `timeout-minutes: 45`):
```yaml
    if: github.event.pull_request.draft != true
```

### 2. `security` pular em draft + isenção no gate (valor médio; os dois juntos, nunca só o primeiro)
`.github/workflows/ci.yml`, job `security` (main ~299, após `timeout-minutes: 20`):
```yaml
    if: github.event.pull_request.draft != true
```
E no `ci-gate` (main linha 427) trocar
```
                "${{ needs.security.result }}" != "success" || \
```
por (mesmo padrão já usado para unit-tests/build nas linhas 422/425):
```
                ( "${{ needs.security.result }}" != "success" && ! ( "${{ github.event.pull_request.draft == true }}" == "true" && "${{ needs.security.result }}" == "skipped" ) ) || \
```
e incluir `needs.security.result == "skipped"` na mensagem "Validação parcial de draft" (linha 431). Conferir se há teste em `workflow-contracts.unit.mjs` que fixe o texto do gate.

### 3. E69 — `build` sem esperar `typecheck` (valor baixo; opcional, decisão de engenharia)
`.github/workflows/ci.yml:229`: `needs: [typecheck, unit-tests]` → `needs: [unit-tests]`.
`scripts/ci/workflow-contracts.unit.mjs:561-565` substituir por:
```js
test('E69: build espera unit-tests; typecheck corre em paralelo mas ci-gate espera os dois', () => {
  const grafo = grafoDeNeeds(wf['ci.yml']);
  const ancBuild = ancestrais(grafo, 'build');
  assert.ok(ancBuild.has('unit-tests'), 'build deixou de esperar o test');
  assert.ok(!ancBuild.has('typecheck'), 'build voltou a esperar typecheck — desfaz E69');
  // ci-gate deve continuar esperando typecheck (prova que o parallelismo nao remove a exigencia)
  const ancGate = ancestrais(grafo, 'ci-gate');
  assert.ok(ancGate.has('typecheck'), 'ci-gate deixou de esperar typecheck');
  assert.ok(ancGate.has('build'), 'ci-gate deixou de esperar build');
});
```
Trade-off: economiza ~2 min de wall-clock por PR, mas o build (required check) passa a poder ficar verde com typecheck vermelho — o gate ainda bloqueia merge. Atualizar também o comentário de `workflow-contracts.unit.mjs:469-474` ("o build continua atrás do lint").

Validação após portar: `node --test scripts/ci/workflow-contracts.unit.mjs`; abrir PR como draft e confirmar que `ci-gate` fica verde com `security`/`e2e` = skipped; marcar ready_for_review e confirmar que tudo roda. Workflow → PR fica aberta para o dono (regra AGENTS.md).

## Verificação adversarial

**Parecer: CONCORDO com PERDIDA_PARCIAL** (não apagar a branch). Tentei refutar cada lacuna; todas se sustentam. Três correções/acréscimos ao plano de port.

Confirmações (main = `dac285f62`):
- `ready_for_review` INCORPORADA: `origin/main:.github/workflows/ci.yml:21-23`.
- `security` sem filtro de draft: `origin/main:.github/workflows/ci.yml:296-299` (só `unit-tests:86` e `build:230` têm `if: github.event.pull_request.draft != true`).
- `e2e` sem filtro e **sem `needs`**: `origin/main:.github/workflows/ci.yml:440-444` → roda em todo push de draft. Fora de `ci-gate.needs` (`ci.yml:410`) e fora dos required checks (`scripts/ci/github-settings-baseline.json`: `["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`). Nenhum teste de `scripts/ci/*.unit.mjs` fixa a condição do `e2e` (`workflow-invariants.unit.mjs` só rejeita `always()` em required job, linhas 125-133) → portável isolado, confirmado.
- Não houve rejeição deliberada: `git log -S'draft != true' --oneline origin/main -- .github/workflows/ci.yml` devolve só `578e5671c` (W45 #2046), cujo `--stat` é `ci.yml | 2 ++` / `db-guard.yml | 1 +` — o corpo da PR citava security/e2e, o diff não os tocou. Nenhum commit removeu os filtros.
- `build.needs` em main ainda `[typecheck, unit-tests]` (`ci.yml:229`); último toque `f1e9e325b` (anterior à branch). Teste antigo vivo em `origin/main:scripts/ci/workflow-contracts.unit.mjs:561-565`.
- Docs OBSOLETA: `origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:78-80` = "**21** arquivos YAML … não inclui workflows dinâmicos" (medido 2026-11-14). A aritmética 19→20 não existe mais.

Acréscimos (lacunas/ajustes que a triagem não listou):
1. **A lacuna 2 (security) exige um quarto arquivo: `scripts/ci/ci-gate.unit.mjs`.** `origin/main:scripts/ci/ci-gate.unit.mjs:31-38` ("as únicas exceções de draft continuam sendo Unit e Build") afirma `conditionOf(job) === 'success()'` para `security`; e a matriz de cenários (`:85-90`) registra `draft_security_skipped` como **gate deve falhar**. Portar só ci.yml + ci-gate quebra `node --test scripts/ci/*.unit.mjs` (que é o job `node-scripts`, required via CI Gate). O pacote da lacuna 2 são **4 edições**: job `security`, expressão do gate (`ci.yml:427`), mensagem (`ci.yml:431`) e `ci-gate.unit.mjs` (lista de exceções + cenários).
2. **O plano em main prescreve outro mecanismo para job required em draft.** `PLANO_...md:771-774` (E71): "o job pesado em draft termina com `exit 0` e resumo 'pulado: draft' (não `skipped`)". Para `security` (dentro do gate) essa é a abordagem canônica do repo; o `if:` da branch + isenção no gate é a alternativa. Decisão de engenharia a registrar na PR — não invalida a lacuna.
3. **E69 (`build` sem `typecheck`) é mais "recusada por desenho" do que perdida.** `origin/main:scripts/ci/workflow-contracts.unit.mjs:467-474` (comentário de 08/10/2026) diz explicitamente que `test`, `security`, `e2e` e `mutation-mapa` saíram do `needs`, mas "o `build` continua atrás do lint E do `test`, que é o gate de fato. Um comentário no YAML não impede ninguém de recolocar o `needs`: estes casos, sim" — ou seja, o teste existe para impedir exatamente a mudança da branch. Valor baixo (~2 min) contra invariante documentado: recomendo **não portar** (tratar como OBSOLETA_POR_DECISÃO) ou levar ao dono junto com o pacote. Não altera o veredito geral, que se sustenta pelas lacunas de `e2e` e `security`.

Ordem recomendada: (1) `e2e` isolado — 1 linha, zero acoplamento, maior economia; (2) pacote `security` (4 edições acima); (3) E69 descartar. Workflow → PR fica aberta para o dono.
