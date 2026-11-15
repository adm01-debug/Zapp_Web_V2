# Dossiê — fix__ci-f1b-restaura-workflows-20261018 (PRs #2056, #2446)

- Ref: `origin/fix/ci-f1b-restaura-workflows-20261018` · tip `4ce5a6e9` · merge-base `e322d379` (2026-10-18)
- Commits: `7f94de856 fix(ci): restaura auto-update-pr-branch e settings-guard, corrige docs de notifica-falha-main` · `558fb262c` merge main · `4ce5a6e97 fix(ci): desliga schedule do auto-update-pr-branch antes de religar`
- Propósito (F1b do PLANO_CI_MAIN_REVISADO): recriar `auto-update-pr-branch.yml` (fila de merge serial via `scripts/ci/fila-merge.mjs`) e `settings-guard.yml`, que haviam sido apagados em `5721e4f50` (16/10), e completar o bloco `# docs:` de `notifica-falha-main.yml` + `docs/ci/README.md` gerado.

## Veredito: OBSOLETA (confiança alta) · apagar branch: SIM

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/auto-update-pr-branch.yml` (novo, 203 linhas) | OBSOLETA — o workflow foi recriado depois (`17976eb8b feat: recriar auto-update-pr-branch.yml`, #2210), corrigido (`818f76b35`, #2656) e **removido de propósito** em `41853318c chore(pacote): pacote 6 (#3113)`, 2026-11-14, junto com `scripts/ci/fila-merge.mjs` (-204) e `fila-merge.unit.mjs` (-167). `git ls-tree origin/main .github/workflows/` não lista o arquivo; `scripts/ci/` não tem `fila-merge*`. Decisão registrada: `PENDENCIAS.md:133-137` ("remove auto-update-pr-branch.yml ... RESOLVIDO em 14/11 ... autorizado pelo dono") e `.claude/commands/merge-prs.md:11,41` ("desligado manualmente em 11/11 → não religue"). A branch já o entregava com `schedule` comentado (linhas 39-40). | `git log --diff-filter=D origin/main -- .github/workflows/auto-update-pr-branch.yml` → `41853318c`, `5721e4f50` |
| `.github/workflows/settings-guard.yml` (novo na branch, 77 linhas) | INCORPORADA — arquivo existe na main com o mesmo conteúdo (66/68 linhas presentes). Única diferença: cron `15 */6 * * *` (branch) vs `15 7 * * *` (main, linha 11, comentário "Z030: reduzido de */6h para 1x/dia", commit `c543c6ade` 2026-10-28, #2054). Redução posterior e deliberada → não portar. | `git show origin/main:.github/workflows/settings-guard.yml` linhas 9-11 |
| `.github/workflows/notifica-falha-main.yml` (+2 linhas `falha:`/`avisa:` no bloco `# docs:`) | INCORPORADA com outro texto — main já tem os dois campos (linhas 4-5: "falha: a falha do workflow original fica sem issue de acompanhamento" / "avisa: equipe de operacao, por meio da issue criada no repositorio"), commit `4b9585052` (#2156, 2026-10-21). Semântica do campo `falha:` na main descreve a falha do próprio notificador, coerente com a coluna "Quando falha" do README. Só redação; valor nenhum. | `git show origin/main:.github/workflows/notifica-falha-main.yml \| head -6` |
| `docs/ci/README.md` | OBSOLETA/INCORPORADA — arquivo é **gerado** a partir dos blocos `# docs:` (checado por `scripts/ci/ci-docs-baseline.unit.mjs:14,50`). Main tem "21 workflows" (linha 7); linha "Notifica falha na main" presente (linha 26) com o texto da main; linha "Auto Update PR Branches" ausente porque o workflow não existe mais. Detalhes de CI/CD (49-54), DB Guard (77-82), E2E Talk X (119-124), Settings Guard (147-152) já atualizados. `removed_still_in_main` ("Gatilho: pull_request, push na main e dispatch" do CI/CD) é o estado correto: `ci.yml` na main declara exatamente isso no bloco `# docs:` (linha 2) e explica em `nao-e-bug` que `merge_group` foi retirado (conta User). Editar à mão contra o gerador = quebrar o check. | `git show origin/main:docs/ci/README.md` linhas 7, 26, 49-54 |

## Lacunas a recuperar
Nenhuma. Toda intenção útil (settings-guard, docs do notifica-falha) está na main; a parte central (auto-update-pr-branch + fila-merge) foi removida de propósito pelo dono em 14/11 (#3113) — recriá-la contradiz a decisão vigente (`merge-prs.md:41`: "não religue").

## Contexto
- `triagem_2804` (08/11): OBSOLETA para #2056 e #2446 — confirmado aqui com prova por arquivo.
- Dossiê histórico: `docs/_arquivo/analise-prs/dossies/PR-2056.md`.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** · apagar branch: SIM · tentei refutar os 4 arquivos, nenhum hunk de valor ≥ médio sobrou.
`origin/main` em `dac285f62` (15/11/2026 03:16). `git diff e322d379 origin/fix/...` = 4 arquivos, +337/-20.

1. **`auto-update-pr-branch.yml` (+203, o único hunk grande)** — removido de propósito, não perdido.
   `git log --diff-filter=D origin/main -- .github/workflows/auto-update-pr-branch.yml scripts/ci/fila-merge.mjs` → `41853318cdad8f5` (2026-11-14, "chore(pacote): pacote 6 — as 26 PRs abertas integradas num ciclo de CI (#3113)"), que apaga `auto-update-pr-branch.yml` (-215), `scripts/ci/fila-merge.mjs` (-204) e `fila-merge.unit.mjs` (-167). `git ls-tree origin/main .github/workflows/` lista 21 arquivos, nenhum `auto-update*`; `scripts/ci/` sem `fila-merge*`.
   Decisão vigente confirmada em dois lugares: `PENDENCIAS.md:130-133` ("remove `auto-update-pr-branch.yml` ... **RESOLVIDO em 14/11** ... Entrou no pacote 6 (PR #3113, commit `41853318cd`), autorizado pelo dono na sessão") e `.claude/commands/merge-prs.md:41` ("`auto-update-pr-branch.yml` está desligado — **não religue**"; idem linha 11). Portar este hunk violaria regra vigente, não é lacuna.

2. **`settings-guard.yml` (+77)** — `diff origin/main:… origin/fix/…:…` dá exatamente 2 linhas: linhas 10-11, cron. Main: `'15 7 * * *'` com comentário "Z030: reduzido de */6h para 1x/dia"; branch: `'15 */6 * * *'`. A main é a versão **posterior e deliberada** (redução de custo). Portar = reverter a decisão. Resto do arquivo idêntico.

3. **`notifica-falha-main.yml` (+2)** — a main não só já tem `falha:`/`avisa:` (linhas 4-5) como é **estritamente melhor** que a branch: `workflow_run: # zizmor: ignore[dangerous-triggers]` (branch não tem), `Front release targets (V2/V3)` na lista monitorada (branch não tem), `actions/github-script@3a2844b7…# v9.0.0` (branch ainda em `@60a0d830… # v7.0.1`). Aplicar a branch rebaixaria pin de action e lista de workflows. Só redação.

4. **`docs/ci/README.md` (18 linhas "faltando")** — arquivo **gerado**: `origin/main:docs/ci/README.md:3-5` diz "Gerado por `scripts/ci/render-workflow-docs.mjs` ... o CI roda `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow" (script existe: `git ls-tree origin/main scripts/ci/` → `render-workflow-docs.mjs`, `ci-docs-baseline.unit.mjs`). Toda linha "faltando" é texto antigo cuja versão na main é mais rica — ex.: Branch Hygiene main (linha 11) "branches podaveis, PRs paradas ha mais de 7 dias **e SLA dos alertas de code scanning**" vs branch "quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias"; CodeQL main (linha 14) "agendado (**diário**)" vs branch "(semanal)"; E2E logado main (linhas 112-118) descreve 15 projetos/5 grupos/3 shards vs branch "fluxo logado (Playwright com login real)". "16 workflows" (branch) × "21 workflows" (main, linha 7). `removed_still_in_main` "Gatilho: pull_request, push na main e dispatch" é o estado **correto**: `origin/main:.github/workflows/ci.yml:2` declara isso e a linha 7 (`nao-e-bug`) explica que `merge_group` não existe em conta `User`. Editar à mão quebra o `--check`.

Nenhum arquivo do item é `src/`, edge ou migration; nada a resgatar. Branch pode ser apagada.
