Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/queues/useQueueDetails.ts (novo): tira a carga de dados de dentro da tela e faz o enriquecimento dos contatos por consultas AGREGADAS — UMA leitura de `messages` com `in('contact_id', ids)` (paginada com fetchAllRows, para não subcontar contato muito ativo) e UMA leitura de `profiles` com `in('id', ids)`. Antes, cada um dos 50 contatos da página disparava 2 consultas de `messages` (contagem + última) mais 1 de `profiles`. Expõe `notFound` e `error` como estados DISTINTOS e um `refetch` com token: resposta de requisição antiga (troca de fila/refetch) é descartada sem mexer no `loading` corrente.
- src/pages/QueueDetails.tsx: passou a consumir o hook; os dois modos de falha viraram telas diferentes — falha de leitura mostra "Erro ao carregar a fila" com botão "Tentar novamente"; id inexistente mostra "Fila não encontrada".
- src/pages/queue-details/__tests__/QueueDetails.consultas.test.tsx (novo): conta as idas a `messages` com 50 contatos na página.
- src/pages/queue-details/__tests__/QueueDetails.erro.test.tsx (novo): prova que as duas telas aparecem diferentes.
- src/hooks/queues/__tests__/useQueueDetails.test.tsx (novo): prova a agregação (contagem/última mensagem/atendente por `in`), a contagem fixa de consultas e a distinção erro × não-encontrada.
- src/pages/queue-details/__tests__/QueueDetails.totais.test.tsx e QueueDetails.configurar.test.tsx: mocks ajustados para as duas formas novas (maybeSingle, `in`), sem mudar as asserções.

## Prova
- vermelho antes (fonte na base dia/2026-10-11): `npx vitest run src/pages/queue-details/__tests__/QueueDetails.consultas.test.tsx` -> `expected [ 1 ] to have a length of 1` com recebido 100 (messages consultada 2×N) e `expected 157 to be less than or equal to 10`.
- verde depois: `npx vitest run src/hooks/queues/__tests__/useQueueDetails.test.tsx src/pages/queue-details/__tests__/` -> `Test Files 6 passed (6); Tests 22 passed (22)`.
- lint: `npx eslint <os 7 arquivos do cartão>` -> 0 problemas.
- typecheck: `npx tsc --noEmit -p tsconfig.json` -> sem erro nos arquivos do cartão.

## O que NÃO fiz e por quê
- Não mexi no banco nem na origem das métricas: as contagens da fila continuam vindo de `fetchQueueMetrics` (count no servidor), como já estava; este cartão é do estado/dados do front.
- Não alterei arquivo fora de src/hooks/queues/** e src/pages/**.
