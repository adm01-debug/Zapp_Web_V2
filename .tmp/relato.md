Especialista: workertestes

## O que mudou e por quê
- src/integrations/supabase/__tests__/client.rede.test.ts (novo): 8 testes que chamam o fetch REAL do cliente (`supabaseFetch`/`boundedFetch`) com o `fetch` global dublado na fronteira — teto de 12 s (literal conferido contra a constante), `boundedFetch` abortando a requisição pendente com `TimeoutError` e não repetindo, `GET` repetindo 503 e falha de rede (TypeError), `GET` com 5xx em todas as tentativas devolvendo a ÚLTIMA resposta sem lançar (contrato do postgrest), `POST` de escrita sem repetir em 503 nem em rede, `/auth/v1/` passando direto, e abort do chamador encadeado ao sinal da rede (o sinal entregue ao `fetch` fica `aborted`), rejeitando com `AbortError` e sem repetir.
- src/services/__tests__/auth.service.perfil.test.ts (novo): 6 testes de `fetchProfile` com o cliente Supabase e o logger dublados (alvo real): recupera depois de falha de rede e depois de 503; backoff medido por relógio falso (não repete antes de 300 ms, 2ª retentativa só depois de outros 600 ms, teto de 3 tentativas); esgotadas as retentativas LANÇA a falha transitória (não devolve `null`); 400 (negócio) e perfil inexistente continuam devolvendo `null` sem repetir.
- Nenhuma linha de produção foi alterada: `git diff` do commit só tem os dois arquivos novos. Os commits do cartão pai (t_ac6a2a13, `a4325ab25` + `f0325d7ca`) foram trazidos por cherry-pick porque o pai está done mas NÃO integrado na branch do dia.

## Prova
- verde (rodado 3x seguidas, as três idênticas): `npx vitest run src/integrations/supabase/__tests__/client.rede.test.ts src/services/__tests__/auth.service.perfil.test.ts` → `Test Files 2 passed (2); Tests 14 passed (14)` nas rodadas 1, 2 e 3.
- vermelho antes (mutação no cliente, 3 linhas de produção revertidas de propósito, depois restauradas):
  - `SUPABASE_FETCH_TIMEOUT_MS = 12_000` → `600_000`: `AssertionError: expected 600000 to be 12000`, e no teste do teto `AssertionError: expected false to be true` (o sinal da rede nunca é abortado).
  - retry desligado (`const retentavel = false`): `GET repete um 503` → `expected Response { status: 503, ... } to match object { status: 200 }`; `GET repete falha de rede` → `promise rejected "TypeError: Failed to fetch" instead of resolving`; `GET com 5xx em todas` → `expected "vi.fn()" to be called 3 times, but got 1 times`.
  - encadeamento do abort do chamador removido: `AssertionError: expected false to be true` (o sinal entregue ao `fetch` não fica abortado).
  - resultado da rodada mutada: `Test Files 1 failed (1); Tests 6 failed | 2 passed (8)` — os 2 que continuam verdes são justamente `POST` de escrita e `/auth/v1/`, que exigem que NADA seja repetido. Produção restaurada em seguida (`git checkout HEAD -- src/integrations/supabase/client.ts`; `git diff --stat HEAD` vazio para os dois arquivos de produção).
- vermelho antes (auth.service na base do dia `dia/2026-10-13`, depois restaurado): `Test Files 1 failed (1); Tests 4 failed | 2 passed (6)` — `recupera depois de falha de rede` → `AssertionError: expected null to match object { id: 'profile-1' }`, `recupera depois de 503` → idem, `backoff` → `expected "vi.fn()" to be called 2 times, but got 1 times`, `esgotadas as retentativas, lança` → `promise resolved "null" instead of rejecting`.

## O que NÃO fiz e por quê
- Não toquei em código de produção (o cartão proíbe); a prova de vermelho foi feita mutando e restaurando a produção de propósito, e o commit só tem teste.
- Não apaguei nem enfraqueci os testes que já existiam (`client.fetch.test.ts`, `auth.service.fetchProfile.test.ts`, do cartão pai): continuam no branch, verdes.
