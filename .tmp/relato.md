Especialista: Íris (area-front-componentes)

## Motivo do cartão (conflito) e como resolvi
O cartão pedia para trazer a ponta de `dia/2026-10-11` e conferir se o defeito ainda existia. O workspace
já nasceu sobre `dia/2026-10-11` (BASE=dia/2026-10-11, HEAD=616782983), sem conflito: o arquivo
`src/components/calls/__tests__/RecordingPlayer.test.tsx` da ponta MANTÉM o mock que o pedido original
queria. Confirmei que o defeito NÃO existe mais e fechei SEM commit de código, como o cartão manda.

## O defeito do pedido ainda existe? NÃO — prova no código atual
- O mock de `@/integrations/supabase/client` (linhas 14-17) JÁ devolve `SUPABASE_URL` e
  `auth.getSession` com token sintético: a mesma correção do trabalho anterior
  (commit f75a1ef80 da branch `v2/tel-recording-001-mock-auth-2610070606027a`, que só acrescentava
  `auth.getSession` + `SUPABASE_ANON_KEY` ao mock).
- O hook `src/hooks/calls/useCallRecording.ts` NÃO chama mais `edgeAuthHeaders()`
  (`grep -n edgeAuthHeaders src/hooks/calls/useCallRecording.ts` → sem resultado; exit 1). Ele autentica
  por `authorizationDoUsuario()`, que usa `supabase.auth.getSession()` (linhas 28-32), e usa `SUPABASE_URL`
  na URL da Edge (linha 35) — exatamente os campos que o mock atual fornece. Também não usa
  `SUPABASE_ANON_KEY`, por isso o mock atual não precisa dele.
- Portanto não há `TypeError: ... reading 'getSession'`: o mock cobre o caminho real do hook.

## Prova (verde, saídas reais)
- `npx vitest run src/components/calls/__tests__/RecordingPlayer.test.tsx` →
  `Test Files 1 passed (1); Tests 11 passed (11)`
- `npx vitest run src/hooks/calls/__tests__/useCallRecording.test.tsx` →
  `Test Files 1 passed (1); Tests 12 passed (12)`
- Caminho real exercitado (critério 3): no verbose o teste `c3` (T67 "com gravacao disponivel baixa o
  stream pela Edge...") passou — ele delega ao hook REAL e afirma
  `fetchMock` chamado em `.../functions/v1/get-call-recording` com `Authorization: Bearer jwt-local`.
  Sem o mock de auth esse teste não renderiza o player (é o defeito do cartão).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (130s)` (db_guard, tipos, lint, migrations OK).

## Nota sobre os números do critério
O critério falava em "7/7" com o hook chamando `edgeAuthHeaders()`: a ponta de `dia/2026-10-11` evoluiu —
o hook passou a autenticar por `getSession`+`fetch` (commit 849efb253) e o arquivo de teste cresceu para
11 casos. Todos verdes, incluindo os 3 do defeito original (c3/v1/v2).

## O que NÃO fiz e por quê
- Não commitei código: o cartão manda fechar sem commit quando já resolvido. `git diff --name-only
  dia/2026-10-11...HEAD` → vazio.
- Não toquei em `src/hooks/calls/useCallRecording.ts` nem em `RecordingPlayer.tsx` (proibido pelo cartão).
- Não afrouxei/reescrevi asserção alguma (a de `not.toContain('http')` no `c3` segue intacta e verde).
