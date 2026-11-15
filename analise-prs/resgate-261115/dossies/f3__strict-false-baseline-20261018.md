# Dossiê — f3__strict-false-baseline-20261018 (PR #2078)

**Ref:** `origin/f3/strict-false-baseline-20261018` · tip `3de493255` · merge-base `e322d3794` (2026-10-18) · 2 commits (1 útil: `8f85e4e28 ci(F3): baseline strict=false (decisão 18/10, opção A sem fila serial)` + 1 merge de main).
**PR #2078:** CLOSED sem merge em 2026-11-01 (congelamento de features #2545). Triagem 2026-11-08: OBSOLETA.

## Propósito
Mudar a política do branch-protection da `main` para `strict=false` (opção A do plano F3, 18/10) em vez de reativar a fila serial de merge (`auto-update-pr-branch.yml` + `fila-merge.mjs`). Toda a branch gira em torno dessa única decisão: baseline, guard, teste do guard e teste-canário na fila.

## Estado da main hoje (prova)
- Política vigente é o **contrário**: `docs/agentes/github-ci.md:32` — "Branch protection — `strict` | **`true`** (política vigente; `false` foi **revogado**)". `AGENTS.md:62` — "PR `BEHIND` → atualize; nunca mexa no `strict`"; `AGENTS.md:82` — perímetro exige `strict=true`.
- Baseline na main: `scripts/ci/github-settings-baseline.json` → `"branch_protection_main":{"strict":true,...}`, `medido_em: 2026-11-02` (commit `630fb5573`, #2597). `git log -S'"strict": false' origin/main -- scripts/ci/github-settings-baseline.json` → vazio: `strict=false` nunca entrou na main.
- Fila serial removida de propósito: `scripts/ci/fila-merge.mjs` e `scripts/ci/fila-merge.unit.mjs` apagados em `41853318c` (2026-11-14, #3113 pacote 6); `auto-update-pr-branch.yml` apagado em `5721e4f50` (2026-10-16). `git ls-tree origin/main scripts/ci/` não lista nenhum `fila-*`. `github-ci.md:58` fala do substituto no passado ("O substituto **era** o `auto-update-pr-branch.yml`").
- Guard na main coerente com `strict=true`: `scripts/ci/github-settings-guard.mjs:7` (doc), `:353` (`strict: true`), `:356`; `github-settings-guard.unit.mjs:18-19,34,165-166,197` (PROT_OK strict=true, regressão = strict=false).

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `scripts/ci/fila-merge.unit.mjs` | NEW_FILE_ABSENT_IN_MAIN (na verdade: arquivo existia no merge-base e foi apagado na main) | **OBSOLETA** — alvo removido; teste canário afirmava `strict === false`, contrário à política vigente | `41853318c` apaga o arquivo; `github-ci.md:32` |
| `scripts/ci/github-settings-baseline.json` | BOTH_CHANGED / CONFLICT | **OBSOLETA** — `strict:false` revogado; main mede `strict:true` em 2026-11-02 | `630fb5573`; `github-ci.md:32`; `AGENTS.md:62` |
| `scripts/ci/github-settings-guard.mjs` | ABSENT_APPLIES_CLEAN | **OBSOLETA** — comentário `strict=false` contradiz a política. Único hunk neutro: `restaurar()` ler `alvo = baseline.branch_protection_main.strict` em vez de hardcode `true` (guard.mjs:349-356). Com baseline `true`, comportamento idêntico ao atual; valor baixo, não bloqueia nada | `guard.mjs:7,353,356` na main |
| `scripts/ci/github-settings-guard.unit.mjs` | BOTH_CHANGED / CONFLICT | **OBSOLETA** — inverte PROT_OK/PROT_REGRESSAO para strict=false; a main testa exatamente o oposto e isso é a política | `guard.unit.mjs:18-19,165-166,197` na main |

## Veredito
**OBSOLETA** (confiança alta). A decisão de negócio que a branch implementava (`strict=false`, opção A) foi revogada pelo dono: a main documenta `strict=true` como política vigente e explicitamente proíbe mexer no `strict`; a fila serial que o teste-canário referenciava foi apagada. Aplicar qualquer hunk desta branch regrediria o perímetro que o `settings-guard` protege.

Não é DECISAO_DONO: a contradição com a regra vigente já foi decidida (a regra da main é a decisão posterior, 11/2026 > 10/2026).

## Lacunas a recuperar
Nenhuma obrigatória. Opcional (valor baixo, cosmético/robustez), se algum dia o baseline mudar de novo:

`scripts/ci/github-settings-guard.mjs` — `restaurar()` ler o alvo do baseline em vez de hardcode (hoje main:349-356):
```js
  if (campo === 'branch_protection_main.strict') {
    const alvo = baseline.branch_protection_main.strict;
    const protection = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
    const contexts = protection?.required_status_checks?.contexts ?? [];
    await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection/required_status_checks`, {
      strict: alvo,
      contexts,
    });
    return `\`branch_protection_main.strict\` restaurado para \`${alvo}\``;
  }
```
(sem o comentário F3; o comportamento com baseline `true` é o mesmo de hoje.)

## Apagar branch
Seguro: **sim** — todos os 4 arquivos classificados com prova; nada útil pendente.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar procurando hunk útil ≥ médio não coberto pela main; não achei.

Diff completo conferido direto (`git diff e322d3794 origin/f3/strict-false-baseline-20261018`): **4 arquivos, 36+/10-**. Todo hunk, exceto um, é a inversão da política `strict`.

Refutações tentadas e resultado:
1. **O `strict=false` é decisão posterior pendente?** Não — é anterior e revogada. A linha que revoga (`docs/agentes/github-ci.md:32` — "`true` (política vigente; `false` foi **revogado**)") entrou em `effd6b0bb` de **2026-11-07** (#2762), 20 dias depois do último commit da branch (2026-10-18). Baseline da main mede `"strict":true` com `medido_em: 2026-11-02`. Reforço: `AGENTS.md:62` "nunca mexa no `strict`" e `github-ci.md:53-56` ("não mexa no `strict`"; PUT completo já regrediu o campo 3x).
2. **A substituição alegada cobre a necessidade?** Sim, e o alvo da branch não existe mais. `git ls-tree origin/main scripts/ci/ | grep fila` → **vazio**; `fila-merge.mjs`/`fila-merge.unit.mjs` apagados em `41853318c` (#3113) e `auto-update-pr-branch.yml` em `5721e4f50`. O hunk de `fila-merge.unit.mjs` é um teste dentro de um arquivo inexistente que importa um módulo inexistente — não aplica nem roda. Bônus: ele afirma `checksObrigatorios().length === 6`, e a main hoje tem **3** checks obrigatórios (`baseline.required_status_checks`; `github-ci.md:30`) — estaria vermelho de duas formas.
3. **Algum hunk neutro de valor ≥ médio?** Só um candidato, e é **baixo**: `restaurar()` lendo `const alvo = baseline.branch_protection_main.strict` em vez de `strict: true` hardcoded. Confirmei que **não está na main** (`origin/main:scripts/ci/github-settings-guard.mjs:349-356` ainda hardcoda `true`; `git log -S"baseline.branch_protection_main.strict" origin/main -- …guard.mjs` → vazio). É inconsistência real (a *detecção* em `:172-174` já lê `esperado.strict` do baseline, a *restauração* não), mas latente e **inalcançável** sob a política vigente: com baseline `true`, `alvo === true` e o comportamento é idêntico ao atual. Só dispararia se o baseline voltasse a `false` — exatamente o que a regra proíbe. Não há teste na main dependendo do literal (`git grep "restaurado para" origin/main -- scripts/ci` só acha as próprias strings do guard). Mantido como lacuna opcional de valor baixo; não rebaixa o veredito a PERDIDA_PARCIAL.
4. **Os dois hunks de teste restantes?** `github-settings-guard.unit.mjs` inverte `PROT_OK`/`PROT_REGRESSAO`/`MARCADOR_REGRESSAO` para tratar `strict=true` como a regressão. A main (`:18-19,34,165-166,197`) testa o oposto, e esse oposto **é** a política. Portar = o guard passaria a restaurar/acusar na direção errada. Valor negativo, não lacuna.

Conclusão: `apagar_branch_seguro = true`. Nenhum hunk desta branch deve ser portado; o único com algum mérito técnico é cosmético e pode ser feito de novo em 4 linhas a partir do dossiê, sem a branch.
