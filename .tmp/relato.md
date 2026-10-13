Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/chat/sendQueue.ts` (novo): fila SERIAL por conversa. A tarefa de uma fila ociosa começa no mesmo tick (preserva o envio único acionado dentro do Enter); as seguintes entram na cauda e esperam a vez; uma rejeição não encadeia (libera a próxima) e a fila de um contato não espera a de outro.
- `src/components/inbox/chat/useChatPanelHandlers.ts`: o envio de texto entra na fila da conversa e o compositor é liberado na hora (o ramo de texto deixa de setar `isSending`, que agora só cobre edição, e deixa de esperar o despacho no Edge). O Enter durante um envio em andamento ENFILEIRA em vez de ser descartado. A animação/som de "enviado" e o toast de erro passam a sair do aceite/rejeição do transporte; falha devolve o rascunho (sem sobrescrever texto novo digitado no meio, e devolvendo também a resposta citada).
- `src/hooks/inbox/useRealtimeInbox.ts`: `handleSendMessage` não chama mais `refreshActiveConversation()` — o INSERT da mensagem enfileirada já atualiza a lista (`useRealtimeMessages`) e a conversa aberta (`useMessages`) pela inscrição `global-messages-realtime`.
- `src/hooks/chat/__tests__/paridade06-envio.pendentes.test.ts`: saíram os três `it.todo` de PK-21 (as provas agora existem nos arquivos acima), como o próprio registro pede.

## Prova
- vermelho antes (base `dia/2026-10-13`, em `.tmp/base-dia`): `npx vitest run .../fila-serial.test.tsx .../sem-refetch-no-envio.test.tsx .../sendQueue.test.ts` → `Test Files 3 failed (3); Tests 4 failed | 2 passed (6)`, com `AssertionError: expected 'segunda' to be ''` (2º Enter descartado), `expected [ 'lenta' ] to deeply equal [ 'lenta', 'outro-contato' ]` (sem fila por conversa), `expected "vi.fn()" to not be called at all, but actually been called 1 times` (refetch no envio) e `Failed to resolve import "../sendQueue"` (a fila não existia).
- verde depois: `npx vitest run src/components/inbox src/hooks/inbox src/hooks/chat` → `Test Files 261 passed | 3 skipped (264); Tests 2136 passed | 3 expected fail | 22 todo (2161)`.
- tipos: nenhum erro novo introduzido pelo diff (o linter acusa só os `TS2307` de alias/`node_modules`, que já existem no arquivo antes da mudança).

## Arquivos fora da lista do cartão (justificativa)
O cartão lista `src/hooks/chat/` (envio e fila), `src/services/` (messageSender), "componente do compositor (só o necessário)" e testes. Todos os arquivos que toquei caem nessas três classes:
- `src/hooks/chat/sendQueue.ts` (+ `__tests__/sendQueue.test.ts`): a fila serial, em `src/hooks/chat/`.
- `src/components/inbox/chat/useChatPanelHandlers.ts` (+ `__tests__/useChatPanelHandlers.fila-serial.test.tsx`): o COMPOSITOR — é onde o Enter/handleSend travava; "só o necessário" = o ramo de texto do `handleSend` e o teste dele. Sem essa mudança não há como o Enter enfileirar nem o rascunho ser preservado.
- `src/hooks/inbox/useRealtimeInbox.ts` (+ `__tests__/useRealtimeInbox.sem-refetch-no-envio.test.tsx`): o item 3 do critério ("tirar o refetch da lista do caminho do envio") mora só aqui — `handleSendMessage` é a ponte que o compositor chama; fora da pasta `src/hooks/chat/` por um nível, mas é a mesma camada de envio. Nada além da remoção do `refreshActiveConversation()` foi mudado.
- Nenhum arquivo de outro assunto entrou.

## O que NÃO fiz e por quê
- Não toquei no caminho de áudio (`handleSendAudio`) nem no de edição: continuam com `refreshActiveConversation()`/`isSending` como estavam; PK-25 é de outra prova.

