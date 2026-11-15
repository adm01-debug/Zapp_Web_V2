# Dossiê — claude/fix-E71-draft-skip-security-e2e-261101-1200 (PR #2497)

**Propósito** (commits `8ba257817`, `85d762665`, merge `3f3886545`): em `.github/workflows/ci.yml`, adicionar
`if: github.event.pull_request.draft != true` aos jobs `security` e `e2e` (E71, economizar minutes em PR rascunho) e
4 comentários "E71: pula em PRs draft..." nos 4 jobs com guard (unit-tests, build, security, e2e). Único arquivo, +6 linhas.

## Arquivo × achado × evidência

| Hunk (branch) | Na main? | Achado | Evidência |
|---|---|---|---|
| comentário E71 em `unit-tests` (L83) | não | ruído: guard já existe sem comentário | `origin/main:.github/workflows/ci.yml:86` `if: github.event.pull_request.draft != true` |
| comentário E71 em `build` (L190) | não | ruído: guard já existe | `origin/main:.github/workflows/ci.yml:230` |
| `if: draft != true` + comentário em `security` (L258-259) | não | **CONTRADIZ a main**: `ci-gate` exige `needs.security.result == "success"` sem exceção de draft; `security` pulado em draft = gate vermelho em todo PR rascunho. Teste permanente proíbe o guard fora de unit/build. | `ci.yml:410` `needs: [... security ...]`; `ci.yml:427` `"${{ needs.security.result }}" != "success"` sem cláusula de draft (só unit-tests L422 e build L425 têm); `scripts/ci/ci-gate.unit.mjs:31-38` "as únicas exceções de draft continuam sendo Unit e Build" → espera `success()` em `security`; roda no job `node-scripts` (`ci-gate.unit.mjs:28` `node --test scripts/ci/*.unit.mjs`). Decisão deliberada: commit `a96bbd4cb` (#2711) "Preserva apenas os skips intencionais de unit-tests e build em PR draft". |
| `if: draft != true` + comentário em `e2e` (L350-351) | não | única lacuna recuperável: `e2e` (45 min, não está no `ci-gate`, `ci.yml:410`) roda em draft hoje. Economia de runner; sem regra na main contra. Valor baixo. | `origin/main:.github/workflows/ci.yml:440-444` (job `e2e` sem `if:`) |

Histórico: `578e5671c` (#2046, W45) só adicionou o guard em unit-tests e build (hunks @80 e @173); security/e2e nunca tiveram
guard na main. Triagem anterior (2026-11-08) já marcou #2497 como OBSOLETA; dossiê arquivado `docs/_arquivo/analise-prs/dossies/PR-2295.md`
tratou a PR irmã #2295 (mesmo objetivo) como SKIP_PROHIBITED.

## Veredito: PERDIDA_PARCIAL (confiança alta)
- Parte `security`: **não portar** — quebra o CI Gate em drafts e falha `scripts/ci/ci-gate.unit.mjs`. Obsoleta/contraditória.
- Comentários E71 (4 linhas): ruído, ignorar.
- Parte `e2e`: 1 linha portável, valor baixo (economia de minutes). Se portar, `e2e` passa a não rodar em draft; o
  gatilho `ready_for_review` (`ci.yml:23`) já garante rerun ao marcar como pronto. Não exige mudança no gate nem nos testes
  (`ci-gate.unit.mjs` só cobre os 7 jobs obrigatórios). Workflow → PR fica aberta e chama o dono (regra AGENTS.md).

### Hunk a portar (`.github/workflows/ci.yml`, job `e2e`, após `timeout-minutes: 45`, ~L443)
```yaml
  e2e:
    name: 🎭 E2E Tests (Playwright)
    runs-on: ubuntu-24.04
    timeout-minutes: 45
+   if: github.event.pull_request.draft != true
    steps:
```

`apagar_branch_seguro`: false (lacuna e2e não está na main; o hunk acima basta para portar sem reler a branch).

## Verificação adversarial

Parecer: **concordo com PERDIDA_PARCIAL**. Tentei refutar por dois lados e os dois falharam.

Tentativa 1 — "a main já cobre o hunk do e2e" (seria INCORPORADA): refutada.
- `git show origin/main:.github/workflows/ci.yml` → job `e2e` (`name: 🎭 E2E Tests (Playwright)`,
  `timeout-minutes: 45`) vai direto de `timeout-minutes` para `steps:`, sem `if:`. Guards de draft na main só em
  `ci.yml:86` (unit-tests) e `ci.yml:230` (build). Confirmado por `git grep -n draft origin/main -- .github`
  (ocorrências: 21, 86, 230, 422, 425, 431, 432 + `db-guard.yml:49`).

Tentativa 2 — "o guard do e2e foi removido de propósito" (seria OBSOLETA, branch apagável): refutada, e a
triagem acertou apesar do título enganoso do commit.
- `git log -S'draft != true' origin/main -- .github/workflows/ci.yml` devolve só `578e5671c` (#2046)
  "W45: pular test/build/security/e2e/db-guard em PR draft" — o **título cita e2e e security, o diff não**:
  `git show 578e5671c -- .github/workflows/ci.yml` = +2 linhas (@@80 unit-tests, @@173 build). Nunca houve
  guard em `e2e`, logo nada foi revertido.
- `git show a96bbd4cb -- .github/workflows/ci.yml` (#2711) mexe **somente** no corpo da decisão do
  `ci-gate` (`jobs.ci-gate.steps[0].run`); não tira `if:` de job nenhum. A decisão deliberada de #2711 restringe
  as exceções de draft aos jobs **obrigatórios** — e `e2e` não é um deles (`ci.yml:410 needs: [typecheck,
  unit-tests, node-scripts, edge-contracts, build, security, workflow-lint]`).
- `docs/_arquivo/analise-prs/dossies/PR-2295.md` marcou a PR irmã como SKIP_PROHIBITED por **escopo da sessão**
  ("Não tocar .github/workflows"), não por regra permanente: "A otimização de skip em draft PRs tem valor (E71)".
  Não serve como rejeição de mérito.

Parte `security` — confirmo que NÃO se porta: `ci.yml:427` exige `"${{ needs.security.result }}" != "success"`
sem cláusula de draft (só L422 unit-tests e L425 build têm), e `scripts/ci/ci-gate.unit.mjs:31-38` afirma
`conditionOf(jobOf(source, 'security'), 4) === 'success()'` — o guard faria o teste permanente falhar no job
`node-scripts` (`ci-gate.unit.mjs:27` exige `node --test scripts/ci/*.unit.mjs`). Os 4 comentários E71: ruído.

Encaixe atual do hunk do e2e (checado, nenhum teste permanente o proíbe):
- `ci-gate.unit.mjs` só itera os 7 obrigatórios → `e2e` fora.
- Os demais testes que leem condições de job apontam para outros workflows
  (`e2e-isolated-workflow.unit.mjs:17` → `e2e-logado-isolado.yml`; `e2e-isolated-legacy-workflow.unit.mjs:15` e
  `e2e-recovery.unit.mjs:18` → `e2e-logado.yml`; `marcador-specs.unit.mjs:51` → `e2e-logado.yml`).
  `e2e-tarefas-project.unit.mjs:21` é o único que lê o job `e2e` do `ci.yml`, e só os **steps**
  (`stepsOf(...).map(shellCode)`) — `if:` de job não o afeta.
- Risco de branch protection: nulo. `scripts/ci/github-settings-baseline.json` (medido 2026-11-02) lista
  required checks = `✅ CI Gate (required check)`, `🏗️ Build`, `🔎 TypeCheck`; `🎭 E2E` não é required. E o
  precedente já existe: `🏗️ Build` é required e **já** é pulado em draft hoje.
- Rerun ao sair de rascunho garantido por `ci.yml:23 types: [opened, synchronize, reopened, ready_for_review]`.

Correções de forma no dossiê (não mudam veredito): o job `e2e` na main começa em `ci.yml:~437` (o `steps:` logo
após `timeout-minutes: 45` fica em ~L442), e o `ci-gate` em `ci.yml:409`.

`apagar_branch_seguro`: **false** — o hunk de 1 linha do `e2e` não está na main e o dossiê já o registra na
íntegra; apagar a branch não perde informação, mas a lacuna segue aberta.
