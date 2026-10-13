Especialista: senior (area-front-hooks)

## Pontos da recusa / pedido de refazer

Ponto 1: trazer o trabalho aprovado 45d0fd8fc sem carregar diff alheio e sem divergir da ponta atual.
- O que fiz: tentei aplicar o commit de código da entrega aprovada (`git cherry-pick -n 619cbcafd`). O cherry-pick ficou vazio porque a base `dia/2026-10-13` já contém o mesmo conteúdo aprovado em `src/lib/queryRetry.ts`, `src/lib/queryClient.ts` e `src/lib/__tests__/queryRetry.test.ts`.
- Prova: `git diff --name-status dia/2026-10-13..v2/react-query-nao-repete-erro-permanente-26101115141e35 -- src/lib/queryClient.ts src/lib/queryRetry.ts src/lib/__tests__/queryRetry.test.ts` não imprime nada; `git diff --name-only dia/2026-10-13...HEAD` não imprime nada antes deste relato; `git log --oneline dia/2026-10-13..HEAD` não imprimia nada antes deste relato.

Ponto 2: manter a correção aprovada para retry de React Query em erro permanente.
- O que ficou na ponta atual: `queryClient.ts` usa `retry: shouldRetryQuery`; `queryRetry.ts` classifica 401/403/404, SQLSTATE permanentes e famílias PGRST/validação como não-retentáveis, preservando retry para falhas transitórias; o teste real do módulo continua em `src/lib/__tests__/queryRetry.test.ts`.
- Teste que prova: `npx vitest run src/lib/__tests__/queryRetry.test.ts` passou com `Test Files 1 passed (1)` e `Tests 13 passed (13)`.

## Arquivos do diff final

`git diff --name-only dia/2026-10-13...HEAD` após o commit de fechamento:

.tmp/relato.md

Nenhum arquivo de código mudou neste refazer. O único diff é o relato versionado porque `hermes-tarefa-fechar` exige commit novo nesta fila; o trabalho aprovado de código já estava idêntico na ponta atual.

## Verificações executadas agora

- `npx vitest run src/lib/__tests__/queryRetry.test.ts` → `Test Files 1 passed (1)`; `Tests 13 passed (13)`.
- `zapp-verify . --rapido` → OK em `db_guard`, `tipos`, `lint`, `migrations`; terminou `VERIFY: VERDE SEM BANCO` porque este cartão não mexe em migration e não foi passado conjunto local.
- `bun run build` → exit 0; Vite terminou `✓ built in 18.04s`.
- `zapp-verify full .` foi tentado; ele completou `db_guard`, `tipos`, `lint` e `migrations`, mas a execução longa foi encerrada pelo runner antes dos passos finais.
- Para cobrir os passos finais manualmente, rodei `bun run test`; a suite completa falhou em teste alheio a este cartão: `src/components/talkx/__tests__/RuleValueInput.test.tsx` (`Test Files 1 failed | 1314 passed`; `Tests 1 failed | 11901 passed | 25 expected fail | 14 todo`). Rodei o arquivo isolado e reproduziu `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)`. `jev-juiz falha .tmp/rulevalueinput-vitest.log` classificou como `pre_existing` com certeza 0.98. Não corrigi porque é fora do escopo e o diff de código deste cartão está vazio.

## O que NÃO fiz

- Não alterei código, teste, migration, manifesto nem guarda: a divergência que motivou o refazer já estava resolvida na base atual, e qualquer mudança nova aqui seria escopo inchado.
- Não corrigi `RuleValueInput.test.tsx`: falha pré-existente e fora do pedido original/refazer.
