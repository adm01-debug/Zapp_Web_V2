# Dossiê — claude__fix-e2e-logado-w71-gr029-261102 (PR #2564)

- Ref: `origin/claude/fix-e2e-logado-w71-gr029-261102` · tip `e00c8857b` (2026-11-01 22:53 -0300) · merge-base `1252bb5a4`
- Único commit: `e00c8857b fix(ci): W71 — e2e-logado dispara após CI/CD Pipeline (workflow_run) em vez de push direto (GR-029)`
- Único arquivo: `.github/workflows/e2e-logado.yml` (+16/-7)

## Propósito
Trocar o gatilho do workflow `E2E logado` de `push: branches: [main]` para `workflow_run` do "CI/CD Pipeline" (types completed), com guarda `if` no job (conclusion == success || workflow_dispatch), ajustar grupo de concorrência e o step "Somente executa na main" para o novo evento. Mudanças acessórias: comentários e troca do emoji 🎭 → 🎧 em dois `name:`.

## Veredito: **INCORPORADA** (confiança alta) — o mesmo trabalho entrou na main por outro PR e foi depois endurecido

O GR-029 foi mergeado na main **no mesmo dia** por outra branch: commit `50ca61a6e fix(ci): testes GR-027 + gatilho workflow_run e2e-logado GR-029 (#2569)` (2026-11-02 01:43 -0300), cujo corpo diz "Substitui PR #2566 (conflito de merge irrecuperável)". O diff de #2569 em `e2e-logado.yml` é funcionalmente idêntico ao desta branch (mesmo `on: workflow_run: workflows: ["CI/CD Pipeline"] / branches: [main] / types: [completed]`, mesmo `if` job-level, mesmo texto do cabeçalho `# gatilho:`). Depois, `afd8c7ca3 fix: validar a suíte logada em ambiente isolado (#2717)` reescreveu o workflow mantendo e reforçando a guarda.

## Arquivo × hunk × achado

| Hunk da branch | Estado na main (`origin/main:.github/workflows/e2e-logado.yml`) | Evidência |
|---|---|---|
| `# gatilho: workflow_run (CI/CD Pipeline concluiu com sucesso na main) e dispatch sobre main` | Presente byte a byte | linha 2 |
| Comentário SEGURANCA "(via workflow_run que aguarda o CI/CD Pipeline passar)" | Bloco de comentário inteiro substituído em #2717 por novo cabeçalho (linhas 6-8) | `git log -S` → `afd8c7ca3`; valor docs/nenhum |
| `on: workflow_run: workflows: ["CI/CD Pipeline"] / branches: [main] / types: [completed]` | Presente (com `# zizmor: ignore[dangerous-triggers]`) | linhas 13-16; introduzido por `50ca61a6e` |
| `concurrency.group` com `(github.event_name == 'workflow_run' \|\| github.ref == 'refs/heads/main')` | Main manteve `github.ref == 'refs/heads/main'` (linha 29). Equivalente: em evento `workflow_run` o `github.ref` é sempre a branch default (`refs/heads/main`), logo a expressão da main já resolve para `e2e-logado` nesse evento. Mudança redundante. | linha 29; semântica do evento `workflow_run` do GitHub Actions |
| `if:` job-level `(workflow_run && conclusion == 'success') \|\| workflow_dispatch` | Presente e **mais estrito** (exige também `event == 'push'`, `head_branch == 'main'`, `head_repository == github.repository`) | linhas 36-42 |
| Step "Somente executa na main" com `if: workflow_dispatch && ref != main` | Step removido em #2717 e substituído por "Validar main e fixar o SHA aprovado antes do checkout", que falha no dispatch fora da main (`exit 1`) e valida o workflow_run | linhas 70-105 (dispatch: 92-96); `git log -S'Somente executa na main'` → `afd8c7ca3` |
| `name: 🎧 E2E logado (Playwright)` / `🎧 Install Playwright` (emoji 🎭→🎧) | Main mantém 🎭 no nome do job (linha 34, agora "E2E logado (backend descartável)"); step "Install Playwright" não existe mais (removido em `afd8c7ca3` #2717 / `17a43ddea` #2889) | cosmético, valor nenhum / obsoleto |

Nenhuma migration, edge ou código `src/` na branch. Sem consulta a banco.

## Lacunas a recuperar
Nenhuma. Tudo com valor funcional está na main (hunks 1, 3, 5, 6) ou é redundante/cosmético (hunks 2, 4, 7). A triagem anterior (`triagem_2804: OBSOLETA`) acertou no efeito prático; a classificação mais precisa é INCORPORADA, pois o mesmo GR-029 foi mergeado via #2569.

## apagar_branch_seguro: **true**

## Verificação adversarial

Parecer: **concordo — INCORPORADA, apagar a branch é seguro.** Tentei refutar hunk por hunk e não achei nenhuma lacuna de valor ≥ médio.

Superfície real da branch (confirmada, não herdada da triagem): `git diff --stat 1252bb5a4 e00c8857b` → 1 arquivo, `.github/workflows/e2e-logado.yml`, +16/-7. Sem migration, edge, `src/` ou teste.

Hunk por hunk, contra `origin/main`:

1. Cabeçalho `# gatilho: workflow_run (CI/CD Pipeline concluiu com sucesso na main) e dispatch sobre main` → `origin/main:.github/workflows/e2e-logado.yml:2`, byte a byte. **Na main.**
2. `on: workflow_run / workflows: ["CI/CD Pipeline"] / branches: [main] / types: [completed]` → `origin/main:.github/workflows/e2e-logado.yml:12-17` (com `# zizmor: ignore[dangerous-triggers]`). Introduzido por `50ca61a6e` (#2569, 2026-11-02 01:43 -0300); `git log -S'workflow_run:' origin/main -- .github/workflows/e2e-logado.yml` confirma `50ca61a6e` como a origem. **Na main.**
3. Guarda `if` de job → `origin/main:.github/workflows/e2e-logado.yml:36-42`, **superconjunto** do da branch: além de `conclusion == 'success'` exige `workflow_run.event == 'push'`, `head_branch == 'main'` e `head_repository.full_name == github.repository`. **Na main, mais estrito.**
4. Step `✋ Somente executa na main` com `if: workflow_dispatch && ref != main` → substituído por `Validar main e fixar o SHA aprovado antes do checkout` (`origin/main:…:70-105`), que no `workflow_dispatch` fora da main faz `exit 1` (linhas 92-96) e no `workflow_run` revalida conclusão/evento/branch/repo (84-91) e o formato do SHA (101-104). Cobertura **estritamente maior** que a do hunk. Substituição deliberada: `git log -S'SEGURANCA: este workflow deliberadamente' origin/main -- …` → `afd8c7ca3` (#2717, 2026-11-04, 334 linhas do arquivo reescritas).
5. Reflow do bloco `# SEGURANCA` acrescentando "(via workflow_run que aguarda o CI/CD Pipeline passar)" → o bloco inteiro não existe mais na main (`grep -n 'SEGURANCA\|secrets E2E\|supervisor'` em `origin/main:…` → nenhum resultado); removido de propósito em `afd8c7ca3` (#2717), que trocou o alvo da suíte para backend descartável e escreveu novo cabeçalho (linhas 3-8). Valor: documentação de um desenho que a main já não usa. **Obsoleto, não lacuna.**
6. `concurrency.group` com `(github.event_name == 'workflow_run' || github.ref == 'refs/heads/main')` → a main mantém só `github.ref == 'refs/heads/main'` (`origin/main:…:29`). **Redundante, verificado:** em evento `workflow_run` o `GITHUB_REF` é sempre a branch default do repo, e `github_get_repo` em `adm01-debug/Zapp_Web_V2` devolve `"default_branch":"main"` — logo a expressão da main já resolve para `e2e-logado` nesse evento. Pior caso se eu estivesse errado: runs de `workflow_run` cairiam em grupo por `run_id` e perderiam a conservação de fila — higiene de CI, não perda funcional. Valor **baixo**, não sustenta PERDIDA_PARCIAL.
7. Emoji 🎭 → 🎧 em dois `name:` → cosmético; a main mantém 🎭 no job (linha 34, renomeado para "E2E logado (backend descartável)") e o step `Install Playwright` não existe mais (`grep -n 'Install Playwright\|playwright@\|🎧'` em `origin/main:…` → nenhum resultado). **Sem valor.**

Achado extra contra a branch: o PR que entrou (`50ca61a6e`, #2569) é superconjunto — além dos mesmos hunks funcionais, fixou `ref: ${{ … workflow_run.head_sha … }}` no checkout e atualizou `docs/ci/README.md`, coisas que esta branch não fazia. Reabrir a branch seria regressão.

Nenhuma lacuna adicional. `apagar_branch_seguro = true`.
