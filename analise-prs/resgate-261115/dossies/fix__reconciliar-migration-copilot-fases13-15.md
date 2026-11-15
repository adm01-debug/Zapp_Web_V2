# Dossiê — fix/reconciliar-migration-copilot-fases13-15 (PR #2491)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
Branch de 2026-11-01 (tip `07ac5c6f`, merge-base `1252bb5a`), 3 commits reais + 5 merges de main:
1. `0a8e3189e` — adicionar `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` (reconciliação da migration remote_only).
2. `0f85245fe` — registrar `20261031100000_copilot_fases13_15_tabelas.sql` em `scripts/db-audit/replay-known-failures.json` (categoria `nao-idempotente-inerte`).
3. `e78b05334`/`c2a220629` — no E2E `email-navy-visual.spec.ts`, esperar os tokens `.dark.high-contrast` assentarem (luminância de `text-muted-foreground`) antes de rodar o axe no webkit.

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` | Idêntico na main (PRESENT_BYTE). | `git ls-tree origin/main` blob `c8f9b382`; entrou por `587ec25f8` (#2551, 2026-11-02). Produção: `schema_migrations` tem `20261030145126` e `20261031100000`; 10 tabelas `copilot_*` e políticas `copilot_outcomes_insert/select` existem (db_query 2026-11-15). |
| `scripts/db-audit/replay-known-failures.json` | Intenção já na main com texto mais completo. As 26 linhas "missing" são só reformatação (branch colapsou cada entrada em 1 linha; main manteve multilinha). | `origin/main` tem a entrada `20261031100000_copilot_fases13_15_tabelas.sql` com `categoria: nao-idempotente-inerte` e motivo ampliado ("Medido em 02/11/2026"), adicionada em `587ec25f8`. Main ainda tem a entrada extra `20261026240300_drop_bkp_261023.sql` e `_atualizado_em: 2026-11-09` (mais novo que o `2026-11-01` da branch). |
| `e2e/email-navy-visual.spec.ts` | Mesma intenção já na main por outra implementação. | `origin/main:e2e/email-navy-visual.spec.ts:541-553`: `requestAnimationFrame` após `waitForAppliedTheme` (commit `13a00e06a`, #2881) + `waitForFunction` medindo luminância de `.email-workspace .text-muted-foreground` com a mesma fórmula sRGB→linear, limiar 0.3 (commit `3e6ed32ac`, #2543). A branch usava um `div` sintético e limiar 0.5 antes do `freezeVisualTransitions`; a main mede o elemento real depois do freeze — cobre o mesmo caso (falso-positivo `color-contrast` no webkit) de forma mais fiel. |

## Lacunas a recuperar
Nenhuma. A única diferença residual é cosmética (formato JSON em 1 linha por entrada), de valor nenhum — a main manteve o formato multilinha de propósito e já evoluiu o arquivo depois.

## Nota
`triagem_2804` já marcava a PR #2491 como `JA_NA_MAIN`; confirmado aqui com prova por arquivo e consulta ao banco de produção.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA** · apagar branch: seguro. Tentei refutar os 3 arquivos; nenhum hunk de valor ≥ médio ficou fora da `main`.

1. **Migration — idêntica, byte a byte.** `git ls-tree origin/main` e `git ls-tree origin/fix/...` devolvem o MESMO blob `c8f9b382d11c52d02e05af9a80fc7487fae2819d` para `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql`; `git diff origin/main origin/fix/... -- <arquivo>` sai vazio. Os DOIS arquivos (`20261030145126_` e `20261031100000_copilot_fases13_15_tabelas.sql`) existem na `main` — nada de migration a resgatar.

2. **`scripts/db-audit/replay-known-failures.json` — a `main` é superconjunto estrito.** Comparei os objetos parseados: branch tem 25 chaves em `esperadas`, `main` tem 26. Chaves só na branch: **nenhuma**. Só na `main`: `20261026240300_drop_bkp_261023.sql`. Para toda chave em comum, `categoria` é igual e nenhum `motivo` da `main` é mais curto que o da branch. A entrada crítica da branch está em `origin/main:scripts/db-audit/replay-known-failures.json:107-110` (`20261031100000_...`, `nao-idempotente-inerte`, motivo ampliado "Medido em 02/11/2026"). `_atualizado_em` da `main` = `2026-11-09` (branch: `2026-11-01`). As 105 "gap_lines" do JSON do item são 100% reformatação (branch colapsou cada entrada em 1 linha).

3. **`e2e/email-navy-visual.spec.ts` — intenção coberta E causa-raiz corrigida depois.** O hunk da branch (13 linhas, `waitForFunction` com `div` sintético `.text-muted-foreground`, limiar de luminância 0.5, ANTES do `freezeVisualTransitions`) não está literalmente na `main`. Mas a `main` cobre o mesmo caso com implementação posterior e mais fiel — `origin/main:e2e/email-navy-visual.spec.ts:537-552`: `requestAnimationFrame` após `waitForAppliedTheme` (commit `13a00e06a`, 2026-11-12, #2881) + `waitForFunction` medindo o elemento REAL `.email-workspace .text-muted-foreground` com a mesma fórmula sRGB→linear, limiar 0.3, DEPOIS do freeze (commit `3e6ed32ac`, 2026-11-02, #2543). Ambos confirmados ancestrais de `origin/main`. Mais decisivo: a causa-raiz que a branch contornava no teste foi corrigida no CSS em `b59f7a02e` (2026-11-02, #2587) — `.dark.high-contrast { --muted-foreground: 0 0% 80% !important; ... }` em `src/styles/accessibility.css:41`, com comentário explicando que o `!important` vence o inline style do `applyThemePreset` nesse caso de timing. O contorno da branch é de 2026-11-01, anterior às três correções.

**Diferença residual (valor baixo, não é lacuna):** o limiar 0.5 da branch distinguiria o token alto-contraste (80% L → lum ≈ 0.60) do cinza do escuro comum, o que o limiar 0.3 da `main` não faz. Não recomendo resgatar: é endurecimento de teste sobre um ponto que a `main` já ajustou duas vezes depois, o `div` sintético da branch fica fora do `.email-workspace` e um limiar fixo de 0.5 passa a travar o teste se a lightness do token cair abaixo de 75%.

Evidências: blob `c8f9b382`; `origin/main:scripts/db-audit/replay-known-failures.json:107-110` e `:5`; `origin/main:e2e/email-navy-visual.spec.ts:537-552`; `origin/main:src/styles/accessibility.css:41`; commits `587ec25f8`, `3e6ed32ac`, `13a00e06a`, `b59f7a02e`.
