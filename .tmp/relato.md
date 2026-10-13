Especialista: hugo

## O que mudou e por quê
- src/utils/normalizeMediaUrl.ts: guarda `typeof url !== 'string'` (valor que não é string devolve '' em vez de lançar `url.trim is not a function`); passou a tratar o artefato auto-hospedado `.atomicabr.com.br"/`; o colapso de barras `([^:][/])[/]+` agora consome TODAS as barras repetidas (antes `https://x.supabase.co///storage/a` virava `...//storage/a`). A regex de supabase.co foi preservada.
- src/lib/abortError.ts (novo): módulo puro, sem logger, com `isIntentionalAbort` (casa por `err.name`) e `isAbortLikeError` (padrão PostgREST que embrulha o abort em `message`, semáforo interno e page unload).
- src/lib/retry.ts: o padrão de `shouldRetry` passou de `() => true` para `() => false` e ganhou a guarda de aborto com PRECEDÊNCIA sobre a política — `AbortError` de page unload/navegação nunca repete nem é logado como ERROR. `withNetworkRetry` ganhou `status >= 500` e fronteira de palavra em 502/503/504. Jitter da `secureRandomFloat` mantido (formula igual).

## Prova
- vermelho antes: `git checkout -- src/lib/retry.ts src/utils/normalizeMediaUrl.ts` + `npx vitest run src/utils/__tests__/normalizeMediaUrl.test.ts src/lib/__tests__/retry.padrao-seguro.test.ts src/lib/__tests__/abortError.test.ts src/lib/__tests__/retry.random.test.ts` -> `Test Files 2 failed | 2 passed (4)` / `Tests 6 failed | 19 passed (25)` (ex.: `expected 'https://x.supabase.co//storage/a.png' to be 'https://x.supabase.co/storage/a.png'`).
- verde depois (mesmo comando, com o fix): `Test Files 4 passed (4)` / `Tests 25 passed (25)`.

## Testes
- src/utils/__tests__/normalizeMediaUrl.test.ts (novo): valor não-string, aspas das pontas, artefato `.supabase.co"/` e `.atomicabr.com.br"/`, colapso de `///` e `//`, protocolo preservado, URL limpa intacta.
- src/lib/__tests__/retry.padrao-seguro.test.ts (novo): sem `shouldRetry` a operação roda 1x; política explícita ainda repete; `AbortError` (DOMException e Error) nunca repete mesmo com `shouldRetry: () => true`; `withNetworkRetry` repete rede e não repete aborto.
- src/lib/__tests__/abortError.test.ts (novo): `isIntentionalAbort` por nome; `isAbortLikeError` no padrão PostgREST/semáforo/unload.
- src/lib/__tests__/retry.random.test.ts (alterado): só recebeu `shouldRetry: () => true` explícito nos dois casos, porque o teste mede o jitter e o padrão deixou de repetir; nenhuma expectativa numérica mudou.

## Chamadores do contrato alterado
- `git grep "from '@/lib/retry'"` -> só `src/components/inbox/AIConversationAssistant.tsx`, que já passa `shouldRetry` explícito (repete apenas fetch/network/timeout): sem mudança de comportamento com o novo padrão.
- O outro chamador citado no cartão, `useVoiceAgent.ts:129`, importa `withRetry` de `src/hooks/voice/retry.ts` (módulo diferente), por isso não foi tocado.

## O que NÃO fiz e por quê
- Não toquei `src/hooks/voice/retry.ts`: é módulo separado e fora dos arquivos do cartão.
- Sem migration, sem dependência nova.
