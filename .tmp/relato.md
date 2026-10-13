Especialista: worker (geral)

## O que mudou e por quê
- `src/components/ai/AutoTicketClassifier.tsx`: a lista de tickets classificados era lida de `ai_conversation_tags` (etiquetas automáticas de IA), removidas do sistema pela ordem de 12/10/2026. Removi a leitura, as heurísticas locais que existiam só para consumir essas etiquetas (`classifyTag`, `derivePriority`) e o campo `tags` do tipo `ClassifiedTicket`. Sem fonte de classificação, `loadClassifiedTickets` devolve lista vazia e a tela fica no estado "Nenhum ticket classificado ainda".
- `src/components/ai/__tests__/AutoTicketClassifier.test.tsx`: a fixture `mockTags` e o bloco "IA-114" (6 testes) exerciam a leitura das etiquetas; foram substituídos pelo bloco "Estado sem etiquetas", que prova a ausência da consulta e o estado vazio.

## Prova
- vermelho antes: `npx vitest run src/components/ai/__tests__/AutoTicketClassifier.test.tsx` (leitura reintroduzida de propósito) → `Tests 2 failed | 43 passed (45)` — os dois testes novos reprovam quando o componente volta a consultar a base.
- verde depois: `npx vitest run src/components/ai/__tests__/AutoTicketClassifier.test.tsx` → `Test Files 1 passed (1); Tests 45 passed (45)`.
- typecheck: `npx tsc -b --force` → sem saída (exit 0).
- lint do escopo: `npx eslint` nos 2 arquivos → `1 problem (0 errors, 1 warning)`; o warning é pré-existente (import do client do Supabase no componente).
- critério do cartão (nenhuma referência): `git grep -n "ai_conversation_tags\|ai-auto-tag\|etiqueta" -- src/components/ai/AutoTicketClassifier.tsx` → vazio.

## Documento/código
- Nada de DDL, Edge, migration ou dependência nova. Diff só nos 2 arquivos citados no cartão.

## O que NÃO fiz e por quê
- Não removi o `invoke('ai-classify-tickets')` do botão "Classificar em Lote": está fora do critério (que cita `ai_conversation_tags`/`ai-auto-tag`) e a Edge é de outra trilha. Com a lista vazia o botão passa a avisar "Nenhum ticket carregado para aplicar as classificações do servidor." e não diz sucesso; um teste novo cobre isso.
- Não toquei em `src/services/contact.service.ts` (ainda lê `ai_conversation_tags`) nem em `AIAutoTagsConfig.tsx`: fora dos arquivos do cartão. Registro como comentário no cartão.
- Os blocos `classifyTag`, `derivePriority`, `Category config`, `Priority map`, `Contact grouping` e os dois edge cases são cópias locais já presentes no teste (nunca importam o componente) e continuam passando; deixei-os intactos para não aumentar o diff.
