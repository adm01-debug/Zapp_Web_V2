Especialista: senior (area-front-componentes)

## O que mudou e por quê
- `docs/DB-INVENTORY.md` (linha de `ai_conversation_tags`): troquei o consumidor `src/components/ai/AutoTicketClassifier.tsx` por `src/components/settings/__tests__/AIAutoTagsConfig.recentesErro.test.tsx`. Motivo: o pedido original tirou do classificador a leitura de `ai_conversation_tags`, então o inventário passou a listar um consumidor que não cita o objeto — o espelho do CI (`scripts/ci/db-inventory-doc.unit.mjs`, teste "docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir") acusava exatamente isso no empilhamento. Status segue `ativo` e o `…` segue verdadeiro (10 citantes no repositório). Toquei no doc porque o O QUE CORRIGIR da recusa manda corrigir a falha do espelho; fora isso, só os 2 arquivos do cartão.
- `src/components/ai/AutoTicketClassifier.tsx` e `src/components/ai/__tests__/AutoTicketClassifier.test.tsx`: sem mudança nesta rodada — continuam como na entrega anterior (sem nenhuma leitura de `ai_conversation_tags`; `grep` nos dois arquivos retorna vazio).

## Prova
- vermelho antes (com a entrega anterior, sem o ajuste no doc): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `✖ docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com `"ai_conversation_tags" lista "src/components/ai/AutoTicketClassifier.tsx", mas esse arquivo não cita o objeto`.
- verde depois: `node --test scripts/ci/db-inventory-doc.unit.mjs` → 15 testes passaram, 0 falharam, incluindo `✔ docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`.
- tentativa intermediária que NÃO serviu (registro honesto): liste primeiro `src/components/docs/featuresSectionsData.ts`, mas o teste seguiu vermelho — o arquivo é espelho do schema (cita 30+ objetos) e não conta como consumidor. A lista final usa os 3 primeiros citantes reais do corpus (`citantesDe`): `AIAutoTagsConfig.tsx`, `AIAutoTagsConfig.recentesErro.test.tsx`, `useContactEnrichedData.test.tsx`.
- comportamento do componente intacto: `bunx vitest run src/components/ai/__tests__/AutoTicketClassifier.test.tsx` → `Test Files 1 passed (1); Tests 45 passed (45)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (16s)`, EXIT=0 (`OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; `AVISO banco_local NÃO VERIFICADO` — sem nome de conjunto, esperado).

## Pontos do revisor
- Ponto 1 (único — espelho do CI no empilhamento): resolvido — `docs/DB-INVENTORY.md:68`, teste que prova acima (vermelho antes, verde depois).

## O que NÃO fiz e por quê
- Não reintroduzi leitura alguma de `ai_conversation_tags` no classificador (o critério 1 do cartão continua valendo; `grep` vazio nos 2 arquivos).
- Não mexi em `src/services/contact.service.ts`, `src/components/settings/AIAutoTagsConfig.tsx` nem na Edge `ai-classify-tickets` (ainda leem a tabela): são outra trilha, fora do critério, e o achado já estava registrado como fora de escopo na entrega anterior.

## Arquivos (`git diff --name-only 96dd72d...HEAD`, copiado do comando)
.tmp/relato.md
docs/DB-INVENTORY.md
src/components/ai/AutoTicketClassifier.tsx
src/components/ai/__tests__/AutoTicketClassifier.test.tsx
