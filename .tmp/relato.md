Especialista: senior (area-front-hooks)

[refazer 1] — reações da conversa em uma consulta: corrigidos ponto a ponto os 4 itens da recusa, sem mudar o desenho (lote em blocos de 100 + fallback solo na falha).

## O que mudou e por quê
- src/hooks/reactions/useBatchReactions.ts: nomes dos autores agora num ÚNICO `.in('id', …)` com a união dos user_ids de todos os blocos, ANTES de semear; contexto trocou `isBatchPending` global por `coveredIds`/`settledIds` por mensagem; `settled` marca SÓ o que foi resolvido (semeado ou falhado — nunca cancelado/superado/erro de nomes); guarda anti-sobrescrita do realtime com `>=`.
- src/hooks/chat/useMessageReactions.ts: trava `enabled:false` por mensagem (coberta e não resolvida); id fora da lista ou sem provider consulta sozinho como antes.
- src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx: mock conta `.in` de profiles e falha seletiva por bloco; +3 testes (união de nomes, id fora da lista, fallback solo do bloco que falhou).
- src/components/inbox/chat/ChatMessagesArea.tsx: mantido do trabalho anterior (memo dos ids + provider envolvendo a lista).

## Prova
- vermelho antes (código anterior + teste novo): `npx vitest run src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx` → `Tests 2 failed | 7 passed (9)` (falham exatamente `nomes dos autores: UM .in() com a união…` e `id fora da lista do provider consulta sozinho…`, ambos por asserção de contagem de consulta).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 9 passed (9)`.
- regressão ao lado: + `src/hooks/__tests__/useMessageReactions.test.tsx` e `src/hooks/chat/__tests__/useMessageReactions.transport-rejection.test.tsx` → `Test Files 3 passed (3); Tests 17 passed (17)`.
- `npx tsc -b --force` → saída vazia, `TSC-EXIT=0`.
- O arquivo `.test.tsx` É descoberto pela suite: `vitest.config.ts` tem `include: ["src/**/*.{test,spec}.{ts,tsx}"]` e a execução acima rodou 9 testes dele; o repo tem dezenas de `.test.tsx` executados do mesmo jeito.

## Pontos do revisor
- Ponto 1 (teste fora da suite): cumprido — o teste está num nome que a suite descobre: `src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx` casa com o `include: ["src/**/*.{test,spec}.{ts,tsx}"]` do vitest.config.ts e a execução real acima rodou os 9 testes dele (`Test Files 1 passed (1); Tests 9 passed (9)`). A extensão segue `.tsx` porque o arquivo usa JSX (`QueryClientProvider`, `span`), que `.test.ts` não compila.
- Ponto 2 (N+1 de profiles): o lote agora acumula as reações de todos os blocos, busca os nomes com UM `.in('id', união)` e só então semeia (`src/hooks/reactions/useBatchReactions.ts`, `load` em duas fases + `fetchReactionUserNames` sem fatiar). Teste que prova: `nomes dos autores: UM .in() com a união dos user_ids de todos os blocos` (150 ids = 2 `.in` de reações + 1 de nomes; falhava antes com 2 chamadas de nomes).
- Ponto 3 (N consultas antes de semear): trava agora é por mensagem — filho dentro do provider com id coberto e não resolvido fica `enabled:false` desde o primeiro passe; id fora da lista consulta sozinho na hora (`useMessageReactions.ts`, `batchDefersMessage`). Teste que prova: `id fora da lista do provider consulta sozinho sem esperar o lote` (antes: `eqCalls` ficava `[]`, travado pelo pendente global).
- Ponto 4 (lote apaga realtime / settled sem semear): `settled` só marca ids resolvidos (semeados ou com falha liberando fallback); execução cancelada/superada não marca nada (a nova cobre); guarda de semeadura com `>=` cobre o caso do mesmo milissegundo (`useBatchReactions.ts:89`, já no diff — o aviso do juiz sobre `>` refere-se ao código anterior). Testes que provam: `bloco que falha libera fallback solo sem travar o bloco que passou` + os já existentes (`stale` do realtime, mensagem nova, falha total com fallback).

## O que NÃO fiz e por quê
- Não toquei em migration, manifesto, CI, `schema-manifest` ou telas: fora dos 4 pontos da recusa, nada além dos 4 arquivos do cartão entrou no diff.

## Arquivos (`git diff --name-only HEAD~1...HEAD`, colado)
- src/components/inbox/chat/ChatMessagesArea.tsx
- src/hooks/chat/useMessageReactions.ts
- src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx
- src/hooks/reactions/useBatchReactions.ts

## Comandos de verificação (resultado real)
- `npx vitest run src/hooks/reactions/__tests__/useBatchReactions.uma-consulta.test.tsx` → `Test Files 1 passed (1); Tests 9 passed (9)`
- `npx vitest run <arquivo acima> src/hooks/__tests__/useMessageReactions.test.tsx src/hooks/chat/__tests__/useMessageReactions.transport-rejection.test.tsx` → `Test Files 3 passed (3); Tests 17 passed (17)`
- `npx tsc -b --force` → sem saída, exit 0
