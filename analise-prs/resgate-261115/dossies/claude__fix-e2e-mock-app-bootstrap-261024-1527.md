# Dossiê — claude__fix-e2e-mock-app-bootstrap-261024-1527 (PR #2225)

**Branch:** `origin/claude/fix-e2e-mock-app-bootstrap-261024-1527` · tip `33e6cd02c` (2026-10-24) · merge-base `b1fe88215`
**Commit único:** `33e6cd02c fix(e2e): adiciona mock do RPC app_bootstrap para corrigir travamento em ProtectedRoute`
**Escopo:** 1 arquivo, `e2e/fixtures/mapa-mocks.ts` (+6/-3).

## Propósito
Nas specs E2E do módulo Mapa, o `mockAppShell` não respondia o RPC `app_bootstrap` (introduzido pelo PR #1986 / `useAppBootstrap`); o catch-all de `rpc/` devolvia `null` e o `ProtectedRoute` travava em "Verificando permissões...". A branch adiciona `page.route(/rpc\/app_bootstrap/)` devolvendo `{}` e exclui `app_bootstrap` do negative-lookahead do catch-all; atualiza o comentário de cabeçalho.

## Arquivo × achado × evidência

| Arquivo | Hunk da branch | Achado | Evidência na main |
|---|---|---|---|
| `e2e/fixtures/mapa-mocks.ts` | `+ await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) => json(route, {}));` + exclusão no lookahead do catch-all | **INCORPORADA em forma superior.** A main responde `app_bootstrap` com payload completo `bootstrap` (derivado de `BOOT_FAKE`, com `roles`, `role_permissions`, `user_settings.onboarding_completed`) e resolve a precedência registrando a rota DEPOIS do catch-all ("a última rota registrada vence"), em vez de alterar o lookahead. Mesmo efeito (ProtectedRoute não trava), mais fiel ao contrato real. | `git show origin/main:e2e/fixtures/mapa-mocks.ts` linhas 106-110: `/rpc\/(?!user_has_permission\|count_searchbox_sessions_this_month)/ → null` (l.108) e `// A última rota registrada vence...` + `/rpc\/app_bootstrap/ → json(route, bootstrap)` (l.109-110). Introduzido por `82e22bbb8` 2026-10-28 "Corrige E2E de Inbox, mapa, Contatos, Email e Talk X" (`git log -S'app_bootstrap' origin/main -- e2e/fixtures/mapa-mocks.ts`), 4 dias após o tip da branch. |
| idem | comentário de cabeçalho: lista `app_bootstrap` entre os RPCs do `mockAppShell` | Não está na main (cabeçalho l.11-13 ainda cita só `user_has_permission`, `count_searchbox_sessions_this_month`). Puramente documental; a função já mocka `app_bootstrap`. | `git show origin/main:e2e/fixtures/mapa-mocks.ts \| sed -n 11,13p` |
| idem | comentário inline "app_bootstrap: introduzido pelo PR #1986..." | Não está na main; substituído pelo comentário "A última rota registrada vence: responder o bootstrap depois do catch-all." (l.109). Ruído. | idem l.109 |

Cobertura adicional do conceito na main: `e2e/a11y-fab-cabecalho.spec.ts:6`, `e2e/ct94-ui-429.spec.ts:91`, `e2e/fixtures/talkx-demo.ts:370`, `e2e/talk-me.spec.ts:181`, `e2e/talkx-launch.spec.ts:106` — todas mockam `app_bootstrap` (`git grep -n app_bootstrap origin/main -- e2e/`).

## Veredito
**INCORPORADA** (confiança alta). O comportamento que a branch corrigia já está na main desde `82e22bbb8`, com mock mais completo. A pré-classificação `MISTO_CONFLITO` vem apenas de texto diferente (comentários + estratégia de precedência por ordem de registro em vez de lookahead). A triagem anterior (`OBSOLETA`) errou o rótulo: não é alvo removido, é a mesma intenção já presente.

## Lacunas a recuperar
Nenhuma funcional. Único resíduo é cosmético (valor nenhum): o comentário de cabeçalho de `e2e/fixtures/mapa-mocks.ts` (l.11-13 na main) poderia citar `app_bootstrap`. Não justifica PR.

## apagar_branch_seguro
true — intenção 100% coberta pela main; resíduo é só comentário.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Tudo que a branch muda (verificado com `git diff b1fe88215 origin/claude/fix-e2e-mock-app-bootstrap-261024-1527` — saída integral, 1 arquivo, 2 hunks, +6/-3):

1. **Hunk funcional** (`e2e/fixtures/mapa-mocks.ts`, rota do RPC): já na main.
   `origin/main:e2e/fixtures/mapa-mocks.ts:109-110` →
   `// A última rota registrada vence: responder o bootstrap depois do catch-all.` +
   `await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) => json(route, bootstrap));`
   A precedência é real e está documentada no próprio cabeçalho do arquivo (`:17-18`: "o Playwright casa as rotas na ordem INVERSA de registro"), então o catch-all da l.108 não alcança `app_bootstrap`. O payload da main (`:89-95`, derivado de `BOOT_FAKE` `:48-62`, com `roles`, `permissions`, `role_permissions`, `user_settings.onboarding_completed` e parametrização `role`/`onboardingCompleted`) é **estritamente superior** ao `{}` da branch — recuperar o hunk da branch seria regressão.
   Introduzido por `82e22bbb822d1cb1abeeaaf31a0cd842ce713045` (2026-10-28, "Corrige E2E de Inbox, mapa, Contatos, Email e Talk X"), ancestral confirmado de `origin/main` (`git merge-base --is-ancestor` → sim), 4 dias após o tip `33e6cd02c` (2026-10-24).

2. **Hunk de comentário** (cabeçalho `:11-13` e comentário inline citando o PR #1986): ausente na main — confirmado abrindo `origin/main:e2e/fixtures/mapa-mocks.ts:11-13`, que ainda lista só `user_has_permission` e `count_searchbox_sessions_this_month`. Valor nulo: descreve comportamento que o código da main já tem, e a explicação do mecanismo na main (l.109) é mais precisa que a da branch (que atribui a causa ao lookahead, estratégia que a main nem usa). Não é lacuna resgatável.

Checagens adicionais que não mudaram o veredito: nenhuma remoção deliberada a recuperar (`git log --oneline origin/main -- e2e/fixtures/mapa-mocks.ts` → `41b212122`, `82e22bbb8`, `afd8c7ca3`, `e900ae317`; nenhum revert/remoção do mock); o conceito está mockado em mais 5 pontos da suíte na main (`git grep -n app_bootstrap origin/main -- e2e/`).

**Veredito final: INCORPORADA. `apagar_branch_seguro = true`.** Nenhuma lacuna adicional.
