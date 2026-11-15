# claude/feat-e71-skip-draft-prs-281026-0250 (PR #2295) — OBSOLETA

- ref: `origin/claude/feat-e71-skip-draft-prs-281026-0250` · tip `68bf4153b` · merge_base `5b7954c7a` (2026-10-28)
- Commits: `695c86028 feat(ci): skip heavy jobs em draft PRs (E71)`, `13d3f1419 fix: adicionar ready_for_review ao trigger pull_request do ci.yml (E71)`,
  `27a310677`/`83c605dfa`/`bad438255` (P006.json + plano), 2 merges de `main`.
- Propósito: etapa **E71** do plano de GitHub Actions — pular jobs pesados quando a PR está em draft
  (`if: github.event.pull_request.draft == false || github.event_name != 'pull_request'`) + trigger `ready_for_review`.

## Por que é obsoleta: a main já fez o mesmo depois, melhor

`git log -S"github.event.pull_request.draft != true" origin/main -- .github/workflows/ci.yml`
→ **`578e5671c` (2026-10-31, PR #2046)** "W45: pular test/build/security/e2e/db-guard em PR draft".
A main usa a forma `if: github.event.pull_request.draft != true` (equivalente: em evento não-PR o campo é
nulo, logo `!= true` é verdadeiro) e **ajustou o `ci-gate` para tolerar job pulado em draft**
(`origin/main:.github/workflows/ci.yml:422,425,431-432`) — coisa que esta branch não fez.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/ci.yml` — `types: [... ready_for_review]` | **já na main** | `origin/main:.github/workflows/ci.yml:23` (com comentário explicando o motivo nas linhas 21-22) |
| `.github/workflows/ci.yml` — gate em `unit-tests` e `build` | **já na main** (texto diferente, comportamento igual) | `origin/main:.github/workflows/ci.yml:86` (unit-tests) e `:230` (build), commit `578e5671c` |
| `.github/workflows/ci.yml` — gate em `node-scripts` e `security` | **não está na main e, como escrito, quebraria a CI** | `ci-gate` exige `needs.node-scripts.result == success` e `needs.security.result == success` sem tolerância a `skipped` (`origin/main:.github/workflows/ci.yml:411,419,421,427`). Pular esses jobs em draft deixaria o required check "✅ CI Gate" vermelho em toda PR draft |
| `.github/workflows/ci.yml` — gate em `e2e` | **não está na main; seria seguro** (resíduo útil, ver abaixo) | `e2e` não está em `needs` do `ci-gate` (`:410`) nem nos required checks (`origin/main:scripts/ci/github-settings-baseline.json` → `["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`) |
| `.github/workflows/codeql.yml` — gate nos 2 jobs | **OBSOLETA: código morto** | A main tirou o CodeQL das PRs (`5721e4f50`, 16/10/2026): os gatilhos hoje são só `workflow_dispatch` + `schedule` (`origin/main:.github/workflows/codeql.yml:16-22`). Um `if` de draft ali nunca é avaliado em PR |
| `.github/workflows/db-guard.yml` — gate em `offline-contract` | **já na main** | `origin/main:.github/workflows/db-guard.yml:49` (`if: github.event.pull_request.draft != true`), commit `578e5671c` |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | **DESTRUTIVO — nunca portar** | Na branch o arquivo tem **23 bytes**: o literal `PLANO_CONTENT_FROM_FILE`. Apagou as 975 linhas do plano (`git show <tip>:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`). Placeholder de push via MCP que foi commitado por acidente. A main está íntegra (975 linhas) |
| `docs/reconciliation/tasks/P006.json` | **valor nenhum: registro falso + churn de formato** | Branch marca `E71.status = DONE_VERIFIED` com nota "Implementado via PR #2295" — PR fechada sem merge, logo a afirmação é falsa. Também reescreve o arquivo minificado (1 linha na main, como P001–P006) em 4.733 linhas pretty-print |

## Resíduo útil (1 linha, se o dono quiser economia de CI)

A implementação da main é **parcial**: em PR draft ainda rodam `🔒 Security Audit` (timeout 20 min) e
`🎭 E2E Tests (Playwright)` (timeout 45 min). Só o `e2e` pode ser pulado com segurança sem tocar no `ci-gate`:

```yaml
# .github/workflows/ci.yml, job e2e (origin/main:.github/workflows/ci.yml:440-443)
   e2e:
     name: 🎭 E2E Tests (Playwright)
+    if: github.event.pull_request.draft != true
     runs-on: ubuntu-24.04
     timeout-minutes: 45
```

Para `security` (e `node-scripts`) seria preciso, no mesmo PR, estender a tolerância do `ci-gate`
(`origin/main:.github/workflows/ci.yml:421,427,431`) ao resultado `skipped` desses jobs — caso contrário todo
draft fica com o required check vermelho. Não é trabalho da branch: é 1 linha no padrão que já existe na main.

## Veredito

**OBSOLETA.** Toda a intenção de negócio (não gastar minutos de CI em draft) está na main via `578e5671c`/#2046,
numa forma compatível com o `ci-gate`; o que falta nesta branch é código morto (codeql), quebraria a CI como
escrito (node-scripts/security) ou é dano/registro falso (plano apagado, P006 mentindo DONE_VERIFIED).
`apagar_branch_seguro = true` — nada a portar; o único resíduo útil está colado acima.

## Verificação adversarial

Refutação tentada contra `origin/main` em `dac285f62`. **Confirmo OBSOLETA e `apagar_branch_seguro = true`.**
Conferi cada linha dos 6 hunks de workflow da branch (`git diff 5b7954c7a origin/claude/feat-e71-skip-draft-prs-281026-0250`,
6 inserções em YAML) uma a uma contra o arquivo da main:

- `types: [opened, synchronize, reopened, ready_for_review]` → **na main**, `origin/main:.github/workflows/ci.yml:23`.
- gate em `unit-tests` → **na main**, `:86` (`if: github.event.pull_request.draft != true`).
- gate em `build` → **na main**, `:230`.
- gate em `offline-contract` → **na main**, `origin/main:.github/workflows/db-guard.yml:49`.
- gate nos 2 jobs do CodeQL → **código morto confirmado**: `origin/main:.github/workflows/codeql.yml:16-22` tem
  só `workflow_dispatch` + `schedule` (comentário na linha 17: "16/10/2026 (decisao do Joaquim, CI minimo): saiu do PR").
- gate em `node-scripts` e `security` → **quebraria o required check, confirmado lendo o gate inteiro**:
  `origin/main:.github/workflows/ci.yml:410` `needs: [typecheck, unit-tests, node-scripts, edge-contracts, build, security, workflow-lint]`
  e `:421`/`:427` exigem `!= "success"` → falha, sem exceção para `skipped` (a exceção existe só para
  `unit-tests` `:422` e `build` `:425`). O corpo desse gate é testado por `scripts/ci/ci-gate.unit.mjs` (PR #2711, `a96bbd4cb`).
- gate em `e2e` → **de fato ausente da main** (`origin/main:.github/workflows/ci.yml:440-443`, `timeout-minutes: 45`,
  sem `if`), e portável com segurança: `e2e` não está no `needs` do `ci-gate` (`:410`) nem nos required checks
  (`origin/main:scripts/ci/github-settings-baseline.json` → `["✅ CI Gate (required check)","🏗️ Build","🔎 TypeCheck"]`,
  medido_em 2026-11-02) e nenhum outro job depende dele (só `:229` e `:410` têm `needs:` no ci.yml).

Checagem de remoção deliberada (para não ressuscitar algo descartado): `git log -S"github.event.pull_request.draft"
origin/main -- .github/workflows/ci.yml` → `a96bbd4cb`, `578e5671c`, `5721e4f50`, `4dadbb74d`. O diff de
`578e5671c` toca **apenas duas** linhas de `if` no ci.yml (jobs `unit-tests` e `build`), apesar da mensagem
dizer "test/build/security/e2e/db-guard" — ou seja, o gate de `e2e` nunca foi aplicado nem revertido; é omissão,
não rejeição. O corpo da #2711 (`a96bbd4cb`) reforça: "Não houve mudança de ... política de E2E ... E2E público
... continua fora desse Gate". Logo o resíduo de 1 linha do dossiê segue válido, e classifico o valor como
**baixo** (repo público → minutos de Actions grátis; o ganho é fila/tempo de parede, ~45 min por push em draft),
abaixo do limiar que justificaria manter a branch viva — a linha é reescrita do zero em segundos e já está no dossiê.

Danos confirmados (nunca portar):
- `git show 68bf4153b:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md | wc -c` → **23 bytes**
  (`PLANO_CONTENT_FROM_FILE`); main tem 975 linhas íntegras.
- `git show 68bf4153b:docs/reconciliation/tasks/P006.json` linha 4461-4464 → `"id":"E71"` com
  `"status": "DONE_VERIFIED"`. Na main o mesmo registro é `"status":"NOT_IMPLEMENTED"`
  (`git show origin/main:docs/reconciliation/tasks/P006.json`, arquivo minificado em 1 linha / 223.821 bytes).
  A PR citada pela branch foi **fechada sem merge**: API GitHub PR #2295 → `"state":"closed"`, `"merged_at":null`,
  `"merged":false`, `closed_at 2026-10-31T03:23:11Z`, `mergeable_state":"dirty"`. Portar o P006 da branch
  gravaria registro falso **e** desmarcaria a verdade atual do ledger.

Nota para o dono (não é lacuna da branch): o ledger da main continua com `E71 = NOT_IMPLEMENTED`, o que está
correto, já que `security` e `e2e` ainda rodam em draft. Fechar o E71 de verdade = 1 linha no `e2e` + estender a
tolerância a `skipped` do `ci-gate` para `security`/`node-scripts` no mesmo PR, com atualização de
`scripts/ci/ci-gate.unit.mjs`. Trabalho novo, em branch nova — independente desta.
