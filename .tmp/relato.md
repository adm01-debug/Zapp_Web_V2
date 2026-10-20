Especialista: hugo

## O que mudou e por quê
- `src/hooks/chat/useConversationAnalyses.ts`: troca estado local + `useEffect` por `useQuery` (chave `['conversation-analyses', contactId]`, `staleTime` 30 s, `enabled: !!contactId && isValidUUID(contactId)`). O mesmo conteúdo era carregado a cada montagem (painel, SLA, sentimento); com a chave por contato o resultado passa a ser compartilhado. `saveAnalysis` insere e chama `invalidateQueries({ queryKey: ['conversation-analyses'] })` para todas as telas montadas revalidarem. `isValidUUID` local usa a mesma regex de `useCalls`/`useWhisperCount` (`contact_id` é uuid; id que não é uuid faria o PostgREST responder 400).
- `refetch` é o próprio `refetch` do `useQuery` (não rejeita: o erro fica em `error`), sem wrapper — um wrapper com `useCallback` foi removido porque o lint acusava dependência faltante (`react-hooks/exhaustive-deps`).
- `src/hooks/__tests__/useConversationAnalyses.test.tsx`: reescrito com `QueryClientProvider`; cobre cache compartilhado entre duas montagens, id não-uuid e nulo sem consulta, erro da consulta, invalidação ao salvar, `refetch`, `getLatestAnalysis` e `getSentimentTrend`.
- API devolvida preservada: `analyses`, `loading`, `error`, `saveAnalysis`, `getLatestAnalysis`, `getSentimentTrend`, `refetch`.

## Prova
- vermelho antes: `npx vitest run src/hooks/__tests__/useConversationAnalyses.test.tsx` com o hook da base (`dia/2026-10-15`) → `Tests 3 failed | 7 passed (10)`
- verde depois: `npx vitest run src/hooks/__tests__/useConversationAnalyses.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)`
- chamadores do hook: `npx vitest run src/components/inbox/__tests__/AIConversationAssistant.ia048.test.tsx src/components/inbox/__tests__/ferramentas-ia.anuncio-estado.test.tsx` → `Test Files 2 passed (2); Tests 9 passed (9)`
- verificação do cartão: `zapp-verify . --rapido` → `OK db_guard` / `OK tipos` / `OK lint` / `OK migrations`; `VERIFY: VERDE SEM BANCO (38s)`

## Critério de pronto
1. Várias montagens geram 1 consulta: teste `várias montagens do mesmo contato geram UMA consulta (cache compartilhado)` — `limitSpy` chamado 1× mesmo com dois hooks montados no mesmo `QueryClient`.
2. id inválido não consulta: testes `id que não é uuid não dispara consulta` e `devolve vazio e não consulta para contactId nulo` — `mockFrom`/`limitSpy` não chamados e `analyses` vazio.

## O que NÃO fiz e por quê
- Não toquei em `src/components/**` nem criei util compartilhado novo: o cartão limita a edição ao hook e aos testes correspondentes.
- Não mexi em `src/hooks/communication/useCalls.ts` (onde vive `isValidUUID`) para não alterar arquivo fora do escopo; a regex foi replicada localmente como em `useWhisperCount`.
