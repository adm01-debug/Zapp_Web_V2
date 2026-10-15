Especialista: hugo

## Pontos da recusa (um por ponto, na ordem)
- Ponto 1: resolvido — `src/hooks/chat/useRealtimeMessages.ts` (fetchConversations): a primeira carga agora chama `RealtimeService.fetchConversationsPage(null)` e guarda `page.nextCursor`/`page.hasMore` do serviço em vez de derivar o cursor do último item exibido e o hasMore de `length >= CONVERSATIONS_PAGE_SIZE`. Removidos o helper local `cursorFromConversations` (só existia neste arquivo) e o `CONVERSATIONS_PAGE_SIZE` do import do hook. Teste que prova: `src/hooks/chat/__tests__/useRealtimeMessages.paginacao.test.tsx` → `primeira carga usa o cursor do serviço: extra mais antigo no fim não desloca a continuação` (página cheia + 1 extra mais antigo no fim; o loadMore tem de sair com o cursor do serviço, não com o do extra).
- Ponto 2: resolvido — `src/services/__tests__/realtime.service.inbox-janela-global.test.ts`: restaurado o teste `quebra a consulta do agregado em blocos de 200 contatos` (205 contatos + mensagens do contato A, que cai fora da página e vira extra; página + extras = 205 ids únicos → 2 blocos: 200 + 5). Era a versão anterior à recusada, que a entrega recusada tinha afrouxado para 1 bloco com `mensagens: []`.
- Ponto 3: declaração — sem o cartão do Iris (`t_a533b441`) ligando o `loadMore` à sidebar, a lista visível cai de 500 para 200 contatos, pois nada consome `loadMore` ainda. Evidência: `CONVERSATIONS_PAGE_SIZE = 200` (`src/hooks/realtime/realtimeUtils.ts`); `src/hooks/inbox/useRealtimeInbox.ts` só repassa `conversations/loading/initialLoading/error/refetch/sendMessage/markAsRead/...` (sem `loadMore`/`hasMore`/`loadingMore`); nenhum componente de inbox/omnichannel referencia `loadMore` do hook (os `loadMore` existentes em FilesTab/journey/mídia são de outras paginacões).

## O que mudou e por quê
- `src/hooks/chat/useRealtimeMessages.ts`: `fetchConversations` (montagem, refetch, reconexão) usa a página 1 do serviço; `loadMore` continua igual (já usava o cursor do serviço). Interface do hook inalterada (`hasMore`/`loadingMore`/`loadMore` continuam expostos do mesmo jeito).
- `src/hooks/chat/__tests__/useRealtimeMessages.paginacao.test.tsx`: mockado o novo contrato (`fetchConversationsPage` devolve a página inteira; `fetchInitialConversations` saiu do mock — se o hook voltar ao antigo, o teste quebra); teste novo do Ponto 1; os testes `não duplica contato repetido na borda` (agora com `nextCursor` real da página 1 + checagem de que o loadMore sai com ele) e `sem próxima página` (agora afirma 1 chamada só — a da página 1 — em vez de 0) mantêm o espírito no novo contrato.
- `src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx`, `src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx`: só a troca do mock para o novo contrato (página `{conversations, hasMore, nextCursor}`); nenhuma asserção de comportamento mudou.
- `src/services/realtime.service.ts`: NÃO mexido (o cursor/hasMore do serviço já estavam certos; o Ponto 1 era só o hook derivando por conta própria). `fetchInitialConversations` segue existindo porque `src/components/omnichannel/OmnichannelInbox.tsx` (projeção) ainda usa — fora do escopo deste cartão.

## Prova
- Ponto 1 vermelho antes (hook antigo + teste novo): `bunx vitest run src/hooks/chat/__tests__/useRealtimeMessages.paginacao.test.tsx` → `1 failed | 3 passed (4)` (`expected "vi.fn()" to be called 2 times, but got 1 times` — a primeira carga nem chamava `fetchConversationsPage`).
- Ponto 2 vermelho antes (cenário 2 blocos + expectativa afrouxada de 1): `bunx vitest run src/services/__tests__/realtime.service.inbox-janela-global.test.ts` → `1 failed | 7 passed (8)` (`expected "vi.fn()" to be called 1 times, but got 2 times`).
- Verde depois: `bunx vitest run` nos 6 arquivos (paginacao, primeiraCarga, reconexao do hook; useRealtimeMessages; inbox-janela-global e inbox-paginacao do serviço) → `Test Files 6 passed (6); Tests 25 passed (25)`.
- `bunx eslint` nos 5 arquivos de código do diff → sem saída (limpo).
- `bunx tsc --noEmit -p tsconfig.app.json` → sem saída (0 erros).

## Arquivos (`git diff --name-only` do commit, exato)
- .tmp/relato.md
- src/hooks/chat/__tests__/useRealtimeMessages.paginacao.test.tsx
- src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx
- src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx
- src/hooks/chat/useRealtimeMessages.ts
- src/services/__tests__/realtime.service.inbox-janela-global.test.ts

## O que NÃO fiz e por quê
- Não liguei o `loadMore` à sidebar: é o escopo do cartão do Iris (`t_a533b441`), citado como dependência; fiz só a declaração do Ponto 3.
- Não removi `fetchInitialConversations` do serviço: `OmnichannelInbox` ainda usa; remover seria regressão ao lado.
- `src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx` tem 2 falhas (lista vazia no seed), mas são PRÉ-EXISTENTES: rodei o mesmo arquivo com meu diff revertido (`git checkout --` nos 5 arquivos) sobre o `29fc95650f` e falhou igual (2 failed). Achado fora do escopo, sem correção neste commit.
- Sem cherry-pick: `hermes-tarefa-iniciar`/`fechar` estão congelados (sem MODO_V2) e o despacho veio sem workspace utilizável; trabalhei no workspace da entrega anterior e o commit novo vai direto sobre o `29fc95650f`. A branch tem abaixo o `e8eff5796e` do cartão pai (`t_1478e618`); meu commit não toca nele.
