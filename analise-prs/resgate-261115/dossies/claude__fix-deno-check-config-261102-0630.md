# Dossiê — claude__fix-deno-check-config-261102-0630 (PR #2578)

**Branch:** `origin/claude/fix-deno-check-config-261102-0630` · tip `cee44e042` · merge_base `8ba0b4361` · 1 commit (2026-11-02)
**Commit:** `cee44e042 fix(ci): deno check --config — corrige typecheck das edge functions (W100)`

## Propósito
Adicionar `--config supabase/functions/deno.json` ao passo `deno check` do workflow `deploy-functions.yml`, para que o typecheck das edges encontre `@types/node` em `supabase/functions/node_modules/` (W100). Diff: 1 arquivo, +4/-1 (1 linha funcional + 3 linhas de comentário).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/deploy-functions.yml` | **INCORPORADA** — a linha funcional da branch (`run: deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`) está byte a byte na main, linha 494. As 3 linhas "faltantes" são só o comentário `# W100 (cont.)…`; a main tem comentário equivalente `# GR-001: --config garante que deno check le nodeModulesDir:"auto" de supabase/functions/deno.json e encontra @types/node em node_modules/.` (linhas 492-493). | `git show origin/main:.github/workflows/deploy-functions.yml` l.491-494; commit `84b8b149e 2026-11-02 fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)` (ancestral de origin/main); `git log -S'deno check' origin/main -- .github/workflows/deploy-functions.yml` lista 84b8b149e. |

O `CONFLICT` mecânico vem de a main ter reescrito o bloco adjacente (`deno install` agora com `cd supabase/functions && deno install --frozen=false`, l.488, e comentários W99/W100/W101/GR-001 l.474-485) na PR #2575, não de intenção divergente.

## Veredito
**INCORPORADA** (confiança alta). PR #2575 (mesmo dia) entregou a mesma correção com escopo maior (cd + --config). Nada a recuperar; diferença residual é texto de comentário (valor nenhum).

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro: sim.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

Checagens independentes (origin/main em `dac285f62`, 2026-11-15):

1. **Diff da branch é mínimo e totalmente conhecido.** `git diff 8ba0b4361 origin/claude/fix-deno-check-config-261102-0630 --stat` → `1 file changed, 4 insertions(+), 1 deletion(-)`, só `.github/workflows/deploy-functions.yml`. Não há segundo arquivo escondido onde um hunk pudesse sobreviver.
2. **A linha funcional está byte a byte na main.** `md5sum` da linha da branch (`deploy-functions.yml:468`) e da linha da main (`deploy-functions.yml:494`) = `8c3de6fa0bd8b72e7170d20f9bf6f74b` nas duas. Idênticas, inclusive indentação.
3. **O passo está ativo na main, não comentado nem desligado.** `origin/main:.github/workflows/deploy-functions.yml:491-494` — step `Typecheck das edge functions (deno check)` sem `if:`, no mesmo job, imediatamente antes do step `Deploy` (l.496).
4. **A necessidade do W100 está coberta com escopo maior.** Main l.486-489 faz `cd supabase/functions && deno install --frozen=false` + `npm --prefix supabase/functions install --no-save @types/node@25.9.9`; a branch não mexia nisso. O `--config` da branch sozinho resolvia só metade do problema que a main resolve.
5. **Ancestralidade provada, não presumida.** `git merge-base --is-ancestor 84b8b149e origin/main` → verdadeiro. `84b8b149ebc4eb59ba7f9081375255cb6f5f550c` (Mon Nov 2 02:02:33 2026) `fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)` — 50 minutos depois do commit da branch (`cee44e042`, 01:12:53).
6. **As 3 linhas de `missing_in_main` são só comentário, e o comentário da main é superset.** Branch: comentário `# W100 (cont.)` explicando que sem `--config` o deno procura `node_modules` relativo ao CWD. Main: `# GR-001` (l.492-493) dá a mesma razão, e o bloco l.474-485 documenta W99/W100/W101/GR-001 com mais detalhe que a branch. Valor residual: texto, zero efeito em CI.
7. **O `CONFLICT` mecânico do JSON não esconde intenção divergente** — vem de #2575 ter reescrito o bloco adjacente (`deno install`), não de direção oposta.

**Não rebaixo para PERDIDA_PARCIAL:** a única diferença é prosa de comentário cuja informação já está na main em forma mais completa. Apagar a branch é seguro.
