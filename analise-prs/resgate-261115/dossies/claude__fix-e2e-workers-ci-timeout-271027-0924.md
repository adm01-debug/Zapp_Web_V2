# Dossiê — claude__fix-e2e-workers-ci-timeout-271027-0924 (PR #2279)

**Branch:** `origin/claude/fix-e2e-workers-ci-timeout-271027-0924` · tip `c2055dff9` · merge-base `3b5f8a96d` · 13 commits (9 são merges de main)
**Propósito:** evitar o cancelamento do job `🎭 E2E Tests (Playwright)` no timeout de 20 min subindo `workers` do Playwright no CI de 1 para 4 (`workers: process.env.CI ? 4 : 2`), mantendo 2 localmente. Único arquivo tocado: `playwright.config.ts` (5+/5-).

## Arquivo × achado × evidência

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `playwright.config.ts` | `workers: process.env.CI ? 4 : 2` + comentário GR-016/W75 (5 linhas) | **OBSOLETA** — a main resolveu o mesmo GR-016 de outra forma, de propósito: `workers: 2` fixo em todos os ambientes | `git show origin/main:playwright.config.ts` linhas 36-37: `// GR-016: 2 workers em todos os ambientes (CI e local).` / `workers: 2,` — introduzido por `a7a53f567` (2026-11-01, `fix(e2e): workers 1→2 em CI — GR-016 (#2560)`), corpo: "Remove a condicional e fixa `workers: 2` em todos os ambientes" |

### Por que 4 workers não faz mais sentido na main
1. **Motivação (timeout de 20 min) desapareceu**: `.github/workflows/ci.yml:443` job `e2e` tem `timeout-minutes: 45` (`6271b716e` #2283, 2026-10-27: 20→45). Suíte logada migrou para `e2e-logado.yml` com 3 shards autenticados de 75 min + 2 grupos deslogados de 45 min (`e2e-logado.yml:43-65`), com comentário explícito "controller preserva workers1 porque as fixtures compartilham estado" (linha 50).
2. **Escolha deliberada da main por 2 workers**: #2560 (`a7a53f567`) é posterior à branch e fixou `workers: 2` comentando GR-016 — a mesma referência da branch. Cobre a mesma necessidade com abordagem diferente.
3. **4 workers introduziria regressão conhecida**: review Qodo na PR #2279 (2026-10-31) apontou que `e2e/email-navy-visual.spec.ts` grava screenshots em caminhos fixos compartilhados pelos 3 projetos de browser; com 4 workers os projetos rodam juntos e sobrescrevem as capturas. A main não alterou esses caminhos.
4. **Fechamento da PR** (2026-11-01): "duplicata de #2504 (workers do Playwright no CI; #2504 cobre o mesmo ajuste + timeouts explícitos)" — hipótese confirmada pelo estado da main (#2560 + timeouts 45/75).

Triagem anterior (2026-11-08) já dava OBSOLETA — confirmado.

## Veredito
**OBSOLETA** · confiança **alta** · `apagar_branch_seguro = true`.
Nada a portar: a única lacuna é um valor de configuração que a main substituiu de propósito (`workers: 2`) e cuja causa-raiz (timeout de 20 min) foi eliminada no workflow.

## Hunk da lacuna (referência; NÃO portar)
```diff
-  workers: process.env.CI ? 1 : 2,
+  // GR-016/W75: CI com 4 workers (1 worker estourava o timeout de 20 min: 129 testes × ~17s;
+  // 2 workers ficavam em ~19 min, sem margem). Localmente seguem 2 ...
+  workers: process.env.CI ? 4 : 2,
```
Main hoje: `workers: 2,` (`playwright.config.ts:37`).

## Verificação adversarial

Parecer: **concordo — OBSOLETA**, `apagar_branch_seguro = true`. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Diff integral `3b5f8a9..origin/claude/fix-e2e-workers-ci-timeout-271027-0924`: **um único arquivo, um único hunk** (`playwright.config.ts`, 5 linhas adicionadas / 5 removidas — 4 delas são comentário). Não há segundo arquivo escondido apesar de `ahead: 13`.

Provas de que a lacuna não tem valor:

1. **A substituição alegada existe e é deliberada.** `git show origin/main:playwright.config.ts` linhas 36-37: `// GR-016: 2 workers em todos os ambientes (CI e local).` / `workers: 2,`. Commit `a7a53f56771257106ad79847e6a9f13b9ddada80` — "fix(e2e): workers 1→2 em CI — GR-016 (#2560)", Sun Nov 1 23:43:28 2026, mesma data do tip da branch e com a justificativa explícita ("a instabilidade original foi resolvida com RETRIES_LOGADOS (E81)"). Mesmo GR-016 que a branch cita, resolvido de outro jeito.

2. **A linha da branch seria INERTE no CI de hoje.** A execução real passa `--workers` na linha de comando, que vence o config: `scripts/e2e-isolated/run.mjs:698` → `'--workers', String(browserWorkers())` e `scripts/e2e-isolated/run.mjs:193` → `export const browserWorkers = () => 1;`. `.github/workflows/e2e-logado.yml:149` chama `bash scripts/e2e-isolated/run.sh suite ...` — não há nenhum `playwright test` direto nos workflows (`git grep -n "playwright test" origin/main -- .github/workflows/` = vazio). Portar `process.env.CI ? 4 : 2` mudaria só o número local, de 2 para 2.

3. **O valor 1 é intencional por estado compartilhado, não por descuido.** `scripts/e2e-isolated/README.md:132`: "Todos os grupos usam `--workers 1`. Os shards autenticados paralelizam somente entre backends independentes; nunca há dois workers mutando as mesmas fixtures." E `.github/workflows/e2e-logado-isolado.yml` (bloco da matriz): "O controller preserva workers1 porque as fixtures compartilham estado." Aplicar 4 workers contrariaria regra vigente.

4. **A causa-raiz citada pela branch deixou de existir.** Não há mais job E2E de 20 min rodando a suíte: `e2e-logado.yml:43` usa `timeout-minutes: ${{ matrix.timeout-minutes }}` com 5 shards (75/75/75/45/45 min) e a paralelização veio da matriz, não de workers. O único `timeout-minutes: 20` restante é o job `network-proof` em `e2e-logado-isolado.yml:227`, que é `workflow_dispatch` e não executa a suíte.

5. **Nada removido por engano.** `git log -S'workers: 2' --oneline origin/main -- playwright.config.ts` aponta para `a7a53f567` como a alteração vigente; nenhum commit de `revert`/`remove` desfez a decisão depois (histórico posterior do arquivo: `#2716`, `#2785`, `#2883`, todos sobre projetos/HTTPS, nenhum tocando `workers`).

Lacunas adicionais: nenhuma.
