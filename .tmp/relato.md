Especialista: worker (geral)

## O que mudou
`src/components/ai/AutoTicketClassifier.tsx`: a lista de tickets classificados era lida de `ai_conversation_tags` (etiquetas automáticas de IA), fora do sistema pela ordem de 12/10/2026. Removi a leitura, as heurísticas locais que só existiam para consumir essas etiquetas (`classifyTag`, `derivePriority`) e o campo `tags` do tipo `ClassifiedTicket`. Sem fonte de classificação, `loadClassifiedTickets` devolve lista vazia e a tela mostra "Nenhum ticket classificado ainda". O componente continua exportado e compilando.

`src/components/ai/__tests__/AutoTicketClassifier.test.tsx`: a fixture `mockTags` e os 6 testes do bloco de aplicação do servidor existiam só para exercitar a leitura das etiquetas — o cartão mandou remover o código junto com eles, e não há fonte para exercitá-los. Substituídos pelo bloco "Estado sem etiquetas" (2 testes): (a) nenhuma consulta a tabela é disparada (o `from` do mock lança e reprova a suíte se a leitura voltar); (b) o botão "Classificar em Lote" não anuncia sucesso com a lista vazia. A expectativa "handles empty tags list" virou o teste de estado vazio. Nenhum `it(...)` foi pulado (`.skip`/`.todo`).

## Prova
- vermelho antes: `npx vitest run src/components/ai/__tests__/AutoTicketClassifier.test.tsx` com a leitura reintroduzida de propósito → `Test Files 1 failed (1); Tests 2 failed | 43 passed (45)`.
- verde depois: `npx vitest run src/components/ai/__tests__/AutoTicketClassifier.test.tsx` → `Test Files 1 passed (1); Tests 45 passed (45)`.
- typecheck: `npx tsc -b --force` → exit 0, sem saída.
- lint do escopo: `npx eslint` nos 2 arquivos → `1 problem (0 errors, 1 warning)`; o warning é pré-existente (import do client Supabase no componente).
- critério 1 do cartão: `git grep -n "ai_conversation_tags\|ai-auto-tag\|etiqueta" -- src/components/ai/AutoTicketClassifier.tsx` → vazio.

## Escopo e achados
- Só os 2 arquivos do cartão. Nada de DDL, Edge, migration ou dependência nova.
- O `invoke('ai-classify-tickets')` do botão "Classificar em Lote" fica: é outra trilha (Edge) e não está no critério. Com a lista vazia o botão avisa "Nenhum ticket carregado para aplicar as classificações do servidor." — coberto por teste.
- Achado fora do escopo (registrado em comentário no cartão): `src/services/contact.service.ts` e `src/components/settings/AIAutoTagsConfig.tsx` ainda leem `ai_conversation_tags`.
- Os blocos `classifyTag`, `derivePriority`, `Category config`, `Priority map`, `Contact grouping` e os dois edge cases são cópias locais já presentes no teste (nunca importam o componente) e seguem passando — deixados intactos para não aumentar o diff.
