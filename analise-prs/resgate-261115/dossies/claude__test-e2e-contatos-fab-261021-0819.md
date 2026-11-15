# Dossiê — claude__test-e2e-contatos-fab-261021-0819 (PR #2148)

**Branch:** `origin/claude/test-e2e-contatos-fab-261021-0819` · tip `22cee627c` · merge-base `bac62ba98` (2026-10-23)
**Commits úteis:** `288afb20c test(e2e): destrava specs deslogados de Contatos com boot e health mockados` (+ merge de main `22cee627c`).
**Triagem anterior (2026-11-08):** OBSOLETA. **Esta triagem:** INCORPORADA (confiança alta).

## Propósito
Spec E2E deslogada `e2e/a11y-fab-cabecalho.spec.ts` (FAB de Contatos em 390x844: geometria, hit-test, pilha flutuante) + mocks de `rpc/app_bootstrap` e sonda `auth/v1/health` nos fixtures (`e2e/fixtures/mapa-mocks.ts`) + inclusão da spec no projeto `chromium-a11y` do `playwright.config.ts`.

## Onde entrou na main
Commit `82e22bbb8` (2026-10-28, "Corrige E2E de Inbox, mapa, Contatos, Email e Talk X — Integra as correções verificadas no PR #2317") tocou exatamente os 3 arquivos da branch (`git show --stat 82e22bbb8`: `e2e/a11y-fab-cabecalho.spec.ts | 146 +`, `e2e/fixtures/mapa-mocks.ts | 25 +-`, `playwright.config.ts | 2 +-`). Depois, `afd8c7ca3` (#2717) e `e900ae317` (#2755) evoluíram `mapa-mocks.ts`.

## Arquivo × achado × evidência

| Arquivo | Pré-classificação | Achado | Evidência |
|---|---|---|---|
| `playwright.config.ts` | PRESENT_REVERSE_APPLIES | Idêntico na main | `origin/main:playwright.config.ts:178` → `testMatch: /a11y-(contraste\|config-admin\|toque-44px\|fab-cabecalho)\.spec\.ts/` |
| `e2e/a11y-fab-cabecalho.spec.ts` | CONFLICT, 18 linhas "faltando" | Intenção incorporada com variante **superior**. As 18 linhas são (a) `USER_ID`/`PERM_MULTIPLIX` + função local `mockBootstrap` (rotas `app_bootstrap` e `auth/v1/health`) — redundantes porque a main centralizou os dois mocks dentro de `mockAppShell` (`origin/main:e2e/fixtures/mapa-mocks.ts:110` e `:122`), que a spec já chama (`origin/main:e2e/a11y-fab-cabecalho.spec.ts:49`); (b) título do 1º teste + `await fab.click()` — a main substituiu por teste mais estrito: mantém o hit-test no centro (`:107-108`) **e** acrescenta tap no canto arredondado via `page.touchscreen.tap` (`:110-117`). Os demais ~128 linhas (CONTATOS, `mockContatos`, `medir`, `centroRecebeToque`, `test.use` mobile, 2º teste da pilha flutuante) são byte-idênticos (`git diff <branch> origin/main -- e2e/a11y-fab-cabecalho.spec.ts` só mostra esses 3 hunks). |
| `e2e/fixtures/mapa-mocks.ts` | CONFLICT, 12 linhas "faltando" | Intenção incorporada. `BOOT_FAKE` existe na main (`:47-62`) com mesma matriz `role_permissions` não-vazia e `perm-multiplix`; diferenças são só texto de comentário, `fetched_at` literal e `user_settings: null` → `{ onboarding_completed: true }` (mais completo; parametrizável via `options.onboardingCompleted`, `:85-95`). Rota `app_bootstrap` registrada depois do catch-all (`:109-110`, mesmo raciocínio "última vence"); sonda `auth/v1/health` em `:121-122`. |

## Veredito
**INCORPORADA.** Nada funcional da branch falta na main; o que "falta" são linhas que a main deliberadamente substituiu por versão equivalente ou mais estrita, no mesmo arquivo. Nenhuma lacuna a recuperar.

**apagar_branch_seguro: true.** PR #2148 pode permanecer fechada; branch pode ser apagada.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

**Concordo: INCORPORADA. Branch pode ser apagada.** Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

Prova central — `git diff origin/claude/test-e2e-contatos-fab-261021-0819 origin/main` nos 3 arquivos retorna apenas:

1. `e2e/a11y-fab-cabecalho.spec.ts` — 3 hunks, todos de main-mais-estrita ou redundância:
   - remoção de `USER_ID`/`PERM_MULTIPLIX` e da função local `mockBootstrap` (rotas `rpc/app_bootstrap` + `auth/v1/health`). Cobertas dentro de `mockAppShell`: `origin/main:e2e/fixtures/mapa-mocks.ts:110` (`page.route(/\/rest\/v1\/rpc\/app_bootstrap/ …)`, registrada DEPOIS do catch-all, mesma regra "última vence") e `:121` (`/auth\/v1\/health/` → 200). As duas constantes eram locais e não têm outro uso. `PERFIL_FAKE.id` na main é exatamente `00000000-0000-4000-8000-000000000001` (`:40`), o mesmo `USER_ID` da branch, e `BOOT_FAKE.role_permissions` é não-vazia com `perm-multiplix` (`:48-62`) — a condição `matrixPermissions !== null` que a branch buscava continua satisfeita.
   - remoção da chamada `await mockBootstrap(page)` em `preparar` — consequência direta do item acima; `preparar` na main ainda chama `mockAppShell` (`origin/main:e2e/a11y-fab-cabecalho.spec.ts:49`).
   - 1º teste: branch terminava em `await fab.click()` (mouse no centro); a main mantém o hit-test de centro (`:106-107`, `centroRecebeToque`) **e** acrescenta `elementFromPoint` no canto arredondado + `page.touchscreen.tap` (`:109-116`), fechando com a mesma assertiva de diálogo visível. Estritamente mais forte, não menos.
   - O resto do arquivo (CONTATOS de 40 itens, `mockContatos`, `medir`, `centroRecebeToque`, `test.use` 390x844/`hasTouch`, 2º teste da pilha flutuante) é byte-idêntico: não aparece no diff.
2. `e2e/fixtures/mapa-mocks.ts` — todos os hunks são a main À FRENTE (host via `SUPABASE_URL`, `mockAppShell` parametrizado por `role`/`onboardingCompleted`, `bloquearRedeReal` por `url.origin`+path). O que a branch tinha e a main "não tem" é só texto de comentário, `fetched_at` literal e `user_settings: null` (a main usa `{ onboarding_completed: true }`, parametrizável) — zero valor funcional perdido.
3. `playwright.config.ts` — nenhuma diferença relevante à branch; a main está à frente (workers, projetos). O único efeito da branch era o `testMatch`, presente: `origin/main:playwright.config.ts:178` → `/a11y-(contraste|config-admin|toque-44px|fab-cabecalho)\.spec\.ts/`.

Checagens extras contra "incorporada no papel, morta na prática":
- A spec roda de verdade: projeto `chromium-a11y` (`playwright.config.ts:171-179`) sem `dependencies: ['setup']` e sem secrets; comentário no próprio bloco diz "Roda no job e2e do ci.yml".
- Não está quarentenada: `git show origin/main:e2e/quarantine.js | grep fab-cabecalho` → sem resultado.
- Os 2 testes continuam ativos (`grep -n "test("` na spec da main: `:96` e `:120`), nenhum `.skip`/`.fixme`.
- Integração confirmada em `82e22bbb8` ("Corrige E2E de Inbox, mapa, Contatos, Email e Talk X"), que adicionou `e2e/a11y-fab-cabecalho.spec.ts | 146 +` e `e2e/fixtures/mapa-mocks.ts | 25 +-`.

Nenhuma lacuna adicional.
