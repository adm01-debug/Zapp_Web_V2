Especialista: senior (hugo)

## O que mudou e por quê
- src/lib/retry.ts: `shouldRetry` agora é consultado ANTES do guard de aborto intencional (a política do chamador decide; o guard continua impedindo retry de AbortError quando a política diria para repetir). `withNetworkRetry` passou a cobrir 502/503/504 + 429/408/409/425 com fronteira de palavra.
- src/lib/secureRandom.ts: `secureRandomFloat` e `secureRandomInt` ganharam fallback para `Math.random()` quando `crypto.getRandomValues` não existe (o jitter do retry nunca quebra em ambiente sem WebCrypto).
- Testes: ordem shouldRetry-antes-do-aborto, 429/408/409/425 em `withNetworkRetry`, fallback sem WebCrypto e URL plana para href/src.

## Prova
- verde depois: `bunx vitest run src/lib/__tests__/retry.padrao-seguro.test.ts src/lib/__tests__/secureRandom.test.ts src/utils/__tests__/normalizeMediaUrl.test.ts src/lib/__tests__/retry.random.test.ts src/lib/__tests__/abortError.test.ts` → `Test Files 5 passed (5)` / `Tests 45 passed (45)`.
- vermelho antes (código antigo, testes novos, prova ponto a ponto):
  - ordem shouldRetry: `vitest run retry.padrao-seguro -t "shouldRetry é consultado mesmo para AbortError"` → `1 failed | 11 skipped` (shouldRetry nunca chamado para AbortError no código antigo).
  - 429: `vitest run retry.padrao-seguro -t "codigo 429"` → `1 failed | 11 skipped` (regex antiga só 502|503|504, 429 não repetia).
  - fallback: `vitest run secureRandom -t "cai para Math.random"` → `1 failed | 11 skipped` (TypeError sem crypto no código antigo).
  - URL plana (S2305): código já devolvia URL plana; o teste novo trava a invariante (sem quoting em href/src/action/formaction).

## Pontos do revisor
- Ponto 1 (shouldRetry antes do guard): inverti a ordem em `src/lib/retry.ts` — `if (!shouldRetry(...)) throw` vem antes de `if (isIntentionalAbort(...)) throw`; o guard continua existindo para que AbortError nunca repita mesmo com `shouldRetry: () => true`. Prova: teste `shouldRetry é consultado mesmo para AbortError (S2226)` — vermelho antes (shouldRetry ignorado), verde depois.
- Ponto 2 (fallback Math.random): `src/lib/secureRandom.ts` com ramo `Math.random()` em `secureRandomFloat` e `secureRandomInt`. Prova: teste `cai para Math.random quando crypto.getRandomValues nao existe (S2244)` — vermelho antes (TypeError), verde depois.
- Ponto 3 (URL plana, sem quoting): `src/utils/normalizeMediaUrl.ts` já devolve URL plana; adicionei `describe normalizeMediaUrl — URL plana para href/src (S2305)` em `src/utils/__tests__/normalizeMediaUrl.test.ts` com teste explícito de href/src (sem `&quot;`/`&amp;`/`&#`) e de artefato com aspas virando URL plana.
- Ponto 4 (502|503|504|429|408|409|425): regex do `withNetworkRetry` em `src/lib/retry.ts` agora `/\b(502|503|504|429|408|409|425)\b/`. Prova: teste `codigo 429 e 408/409/425 repetem em withNetworkRetry` — vermelho antes, verde depois.

## 2ª passada (defeito novo do meu diff)
- `rg shouldRetry` nos chamadores: único chamador de `@/lib/retry`, `AIConversationAssistant.tsx`, passa `shouldRetry` que retorna false para AbortError (mensagem sem fetch/network/timeout) — aborto continua 1x sem retry, igual ao comportamento anterior; muda só o nível do log (warn da política em vez de debug do guard). Sem mudança de comportamento de retry.
- `useVoiceAgent.ts` importa `withRetry` de `src/hooks/voice/retry.ts` (módulo diferente) — não tocado.
- Nenhum arquivo de guarda/manifesto/CI alterado; sem migration; sem toast duplicado; diff restrito aos arquivos do cartão.

## O que NÃO fiz e por quê
- Não toquei `src/hooks/voice/retry.ts`: módulo separado, fora dos arquivos do cartão.
- Não toquei `src/lib/abortError.ts` nem `src/utils/normalizeMediaUrl.ts` (código): o ponto 3 exigia só travar a URL plana com teste, e o código já estava plano.
