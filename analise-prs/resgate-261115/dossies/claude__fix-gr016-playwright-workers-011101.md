# Dossiê — claude__fix-gr016-playwright-workers-011101 (PR #2536)

**Ref:** `origin/claude/fix-gr016-playwright-workers-011101` · tip `901357404` · merge-base `1252bb5a4` · 3 commits (2026-11-01)

## Propósito
GR-016: Playwright com `workers: process.env.CI ? 1 : 2` fazia o Email fixture (Vite completo + artefatos visuais) estourar timeout no CI por fila de 1 worker. A branch fixa `workers: 2` em todos os ambientes. Commits 2 e 3 são só re-trigger de CI (arquivo vazio `.github/ci-refresh`).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `playwright.config.ts` | BOTH_CHANGED / CONFLICT | **INCORPORADA** — a mudança funcional (`workers: 2`) está na main, vinda de outra PR do mesmo GR | `git show origin/main:playwright.config.ts` linhas 36-37: `// GR-016: 2 workers em todos os ambientes (CI e local).` / `workers: 2,`. Commit que trouxe: `a7a53f567 2026-11-01 fix(e2e): workers 1→2 em CI — GR-016 (#2560)` (`git log -S'GR-016: 2 workers' origin/main -- playwright.config.ts`). As 5 linhas "missing_in_main" são só texto de comentário (versão PT-BR com acentos do comentário W75 e acentos em `próprio/é` no bloco `webServer`, main linhas 347-348 mantém `proprio/e'`). Comportamento idêntico. |
| `.github/ci-refresh` | NEW_FILE_ABSENT_IN_MAIN | **Ruído** — arquivo vazio (1 linha em branco) criado apenas para forçar re-run do CI da PR #2536 (commits `d5e53e849`, `901357404`). Não tem função; não deve ir para a main. | `git diff 1252bb5a4 901357404 -- .github/ci-refresh` → `+` (linha vazia). `git ls-tree -r origin/main .github/ | grep refresh` → nada. |

## Veredito
**INCORPORADA** (confiança alta). A única mudança de comportamento (`workers: 2`) entrou na main via PR #2560 (`a7a53f567`), mesmo GR-016, mesmo valor. O resto da diferença é cosmético (acentuação em comentários) ou artefato de CI (`.github/ci-refresh`), valor `nenhum`.

Triagem anterior (2026-11-08) marcou `OBSOLETA`; a classificação mais precisa é INCORPORADA, pois a intenção foi absorvida por outra PR, não descartada.

## Lacunas a recuperar
Nenhuma. Nada a portar.

## Apagar branch
Seguro: **sim**.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Apagar a branch é seguro.**

Tentei refutar procurando qualquer hunk de valor no `git diff 1252bb5a4 901357404`. O diff completo da branch são **2 arquivos, 7 inserções / 7 remoções** — não há nada escondido:

```
 .github/ci-refresh   |  1 +
 playwright.config.ts | 13 ++++++-------
```

Commits: `05a21d9c4 fix(e2e): workers sempre 2 …` + `d5e53e849` e `901357404` (ambos só re-trigger de CI).

1. **A mudança funcional está na main, idêntica.** `git show origin/main:playwright.config.ts` linhas 36-37:
   `// GR-016: 2 workers em todos os ambientes (CI e local).` / `workers: 2,`.
   Veio de `a7a53f567 2026-11-01 fix(e2e): workers 1→2 em CI — GR-016 (#2560)`, confirmado como ancestral:
   `git merge-base --is-ancestor a7a53f567 origin/main` → verdadeiro. Mesmo valor (`2`), sem condicional de CI — comportamento byte-equivalente ao da branch.
2. **As 5 linhas `missing_in_main` são 100% comentário.** Conferi hunk por hunk: (a) o bloco W75/GR-016 é texto explicativo (a main tem versão de 1 linha); (b) `próprio/é` vs `proprio/e'` no bloco `webServer` (main linhas 347-348) é só acentuação. Zero efeito em execução. Valor abaixo de médio — não caracteriza PERDIDA_PARCIAL.
3. **`.github/ci-refresh` é lixo de CI.** `git diff` mostra arquivo novo com 1 linha vazia; `git ls-tree -r origin/main --name-only .github/ | grep -i refresh` → vazio. Correto não ter entrado na main.
4. **Checagem extra (direção inversa):** `git diff origin/main 901357404 -- playwright.config.ts` mostra a branch **atrás** da main em vários pontos que nada têm a ver com GR-016 — ela não tem `usesExternalHttpsServer` (guarda de deployment HTTPS externo), tem `testMatch`/`testIgnore` e `geolocation` antigos nos projetos `chromium`, `chromium-authenticated` e `chromium-mapa`. Qualquer tentativa de "resgatar" essa branch reintroduziria regressões. Reforça apagar.

Nenhuma lacuna adicional. Não baixei para PERDIDA_PARCIAL porque não existe hunk de valor ≥ médio fora da main.
