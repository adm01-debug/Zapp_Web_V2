Especialista: semisenior (area-testes-do-produto)
## O que mudou e por quê
- Entrega refeita do zero sobre `dia/2026-10-14` contendo SÓ os 7 arquivos do commit `9a4ed0d81c` (sessão falsa responde `user_settings` com onboarding concluído). Todo o resto da entrega anterior (migration, `src/`, `playwright.config.ts`, `settings-persistencia`, `useDensity`, relatos) ficou de fora: é do cartão pai e volta pelo cartão dele.
- `e2e/fixtures/mapa-mocks.ts`: novo `USER_SETTINGS_SESSAO_FAKE` + `responderUserSettingsFake(route)`; `mockAppShell` responde `user_settings` como tour concluído em vez de `[]`.
- `e2e/fixtures/talkx-demo.ts`: `installFakeSession` registra `page.route(/\/rest\/v1\/user_settings/, responderUserSettingsFake)` e remove a flag morta `onboarding_completed_<id>` do localStorage; catch-all exclui `user_settings`.
- `e2e/fixtures/email-navy.ts`: catch-all exclui `user_settings` (não engole a rota da sessão falsa).
- `e2e/a11y-config-admin.spec.ts`, `e2e/ct94-ui-429.spec.ts`, `e2e/talkx-launch.spec.ts`: consomem `responderUserSettingsFake`; `mockConfigVazio` não responde mais `user_settings` vazio (reabria o tour e o Radix marcava `<main>` como aria-hidden).
- `e2e/onboarding-dispensar.spec.ts`: única spec que PROVA o tour aberto; re-registra `user_settings` vazio depois dos mocks (última rota vence).
## Prova
- Tamanho: entrega anterior `git diff dia/2026-10-13...HEAD | wc -c` → `116455`; esta entrega `wc -c .tmp/fix-7-arquivos.patch` → `10409`, 7 arquivos, zero fora do título.
- Base idêntica: `sha256sum` de `git show 9a4ed0d81c^:<arq>` vs `git show dia/2026-10-14:<arq>` → `IGUAL` nos 7 arquivos (patch aplica com zero conflito).
- Aplicação: `patch -p1 --dry-run` → OK; `patch -p1` → OK; `cmp` do resultado contra `git show 9a4ed0d81c:<arq>` → `IDENTICO` nos 7 arquivos.
- Sintaxe+imports: `bun build --target=node --packages=external` → entry point OK nos 7 arquivos (imports relativos resolvidos contra os irmãos reais de `dia/2026-10-14`).
- Sem project-ref de produção no patch: `grep -c` → `0`.
- Segunda passada (defeito novo): `onboarding-tour.spec.ts` em `dia/2026-10-14` não usa `installFakeSession`/`mockAppShell` e já tolera tour concluído via skip explícito; a única spec que exige tour aberto (`onboarding-dispensar`) está no diff. Nenhum chamador ficou para trás.
## Pontos do revisor
- Ponto 1: resolvido — a nova entrega tem exatamente os 7 arquivos do commit `9a4ed0d81c` (`e2e/a11y-config-admin.spec.ts`, `e2e/ct94-ui-429.spec.ts`, `e2e/fixtures/email-navy.ts`, `e2e/fixtures/mapa-mocks.ts`, `e2e/fixtures/talkx-demo.ts`, `e2e/onboarding-dispensar.spec.ts`, `e2e/talkx-launch.spec.ts`), patch de 10409 bytes anexado. FAIXA DO PAI: nenhum commit do cartão pai foi trazido; os commits `8a891ca`, `67d7c72`, `863b524`, `177e2e7`, `776e021`, `4c9a29c` da entrega anterior não fazem parte desta entrega.
## Como aplicar (integrador)
- `git checkout -b v2/e2e-falsa-sessao-onboarding dia/2026-10-14 && git apply fix-7-arquivos.patch && git commit` com a mensagem `test(e2e): sessão falsa responde user_settings com onboarding concluído`.
## O que NÃO fiz e por quê
- NÃO criei branch/commit no repo compartilhado: `hermes-tarefa-iniciar` e `hermes-tarefa-fechar` recusam nesta sessão (CONGELADO sem `MODO_V2` na guarda) e a guarda veta `git worktree add` e `git clone`; o trabalho foi refeito em diretório próprio e entregue como patch anexado, byte-idêntico ao commit original reaplicado sobre `dia/2026-10-14`.
- NÃO rodei a suite Playwright: exige servidor+browsers locais fora do alcance desta sessão; a prova é aplicação limpa do patch + transpilação dos 7 arquivos.
