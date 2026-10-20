Especialista: iris

## Pontos da recusa

Ponto 1: guarda implicit-any-ratchet sem nova dívida.
- O que mudei: reaproveitei o commit anterior e deixei o teste novo do chip Arquivadas mais explícito em `src/components/inbox/__tests__/StatusChips.test.tsx`, tipando com `as const` as listas iteradas no teste de estilo ativo. O diff final toca só esse arquivo permitido e não altera produção, guardas, CI, dependências, banco nem ações de arquivamento.
- Prova: `./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --noImplicitAny --pretty false` saiu com exit 0 e sem diagnósticos; `node scripts/ci/implicit-any-ratchet.mjs` imprimiu `implicit-any errors: 0 (baseline: 0)`.

Ponto 2: pedido original do chip Arquivadas continua coberto.
- O que mudei: o teste cobre que Arquivadas aparece com 0 quando não há `conversation_status: 'archived'`, que o clique chama `onChipTabChange('archived')`, que o chip ativo recebe o mesmo estilo ativo dos demais e que conversas arquivadas ficam fora de Todas/Não lidas/Em atendimento/Aguardando.
- Vermelho antes: removi temporariamente o chip Arquivadas de `StatusChips.tsx` só para a prova e rodei `bunx vitest run src/components/inbox/__tests__/StatusChips.test.tsx`; resultado: `12 tests | 6 failed`, começando por `Unable to find an element by: [data-testid="status-chip-archived"]`.
- Verde depois: com o código restaurado, `bunx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` passou com `Test Files 1 passed (1); Tests 12 passed (12)`.

## Arquivos no diff

`git diff --name-only dia/2026-10-11...HEAD`:
- src/components/inbox/__tests__/StatusChips.test.tsx

## Verificações executadas

- `bunx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` -> `Test Files 1 passed (1); Tests 12 passed (12)`.
- `./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --noImplicitAny --pretty false` -> exit 0, sem diagnósticos.
- `node scripts/ci/implicit-any-ratchet.mjs` -> `implicit-any errors: 0 (baseline: 0)`.
- `zapp-verify . --rapido` -> `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; `VERIFY: VERDE SEM BANCO (95s)`.

## O que NÃO fiz

- Não toquei em `StatusChips.tsx`, `src/i18n/index.ts`, guardas de CI, migrations, banco, Edge Function, dependências, `archiveContact`, `bulkArchive` nem `useBulkActions`.
