Especialista: worker (telas) — Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/talkx/TalkXLiveMonitor.tsx` (linhas 20, 37 e 124): importa e chama
  `useTalkXLiveChannel(campaignId)` e passa `liveChannel.live ? false : (liveChannel.panelPollMs ?? undefined)`
  como 3º argumento de `useTalkXMonitor(campaignId, statusFilter, …)`. É o pedido do cartão: ao vivo o
  evento atualiza os dados e o polling do painel para (`false`); sem o canal, o painel usa o intervalo
  degradado (`panelPollMs`) em vez do polling fixo. O `TalkXLiveMonitor.tsx` de hoje (base dia/2026-10-13)
  não estava ligado ao hook — só os hooks do cartão pai estavam integrados —, então a chamada foi adicionada
  aqui, dentro do arquivo permitido. Mantive, como estavam, o `useEffect` do canal `supabase.channel` e o
  `refetchInterval` das consultas de campaign/recipients (fora do pedido do cartão).
- `src/components/talkx/__tests__/TalkXLiveMonitor.states.test.tsx`: mock do canal com `vi.mock` e valor
  controlado por `vi.hoisted` (`liveStatus`, `panelPollMs`), captura do 3º argumento no mock de
  `useTalkXMonitor` e os dois cenários (ao vivo → `false`; degradado → `panelPollMs`).
- 3 mocks de teste (`TalkXLiveMonitor.kpiRow.test.tsx`, `TalkXLiveMonitor.lifecycle.test.tsx`,
  `TalkXHealthCard.test.tsx`): 1 linha cada. O mock de `supabase.channel` tinha só 2 níveis de `.on`; agora
  que o componente também assina o canal único (3 `.on` + `subscribe`), troquei por um canal auto-encadeável.
  Nenhum arquivo de produto além do permitido; é consequência direta do consumo do hook.

## Prova
- vermelho antes: `npx vitest run src/components/talkx/__tests__/TalkXLiveMonitor.states.test.tsx` →
  `Tests 2 failed | 7 passed (9)` (`expected false to be 15000`-style: recebido `null`).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 9 passed (9)`.
- testes afetados rodados agora, todos verdes: kpiRow `2 passed`; lifecycle `5 passed`;
  TalkXHealthCard `20 passed`; TalkXView.route `25 passed`; talkxStates.matrix `44 passed`.
- tipos: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` → exit 0 (sem `error TS`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard OK, tipos OK, lint OK, migrations OK;
  banco não verificado porque o cartão não tem conjunto de banco).

## Critério de pronto, item a item
1. `live === true` → `false`: `TalkXLiveMonitor.tsx:124` + teste "canal ao vivo (live=true)…" (states).
2. `live === false` → `panelPollMs`: `TalkXLiveMonitor.tsx:124` + teste "canal degradado (live=false)…" (states).
3. os dois cenários estão em `TalkXLiveMonitor.states.test.tsx` (2 casos novos).
4. vermelho→verde acima.
5. `zapp-verify . --rapido` verde (linha acima).
6. Diff final = 5 arquivos, NÃO 2 — ver "O que NÃO fiz e por quê".

## O que NÃO fiz e por quê
- **Critério 6 (apenas 2 arquivos): não fecha em 2.** Para ter `liveChannel.live`/`panelPollMs` o componente
  PRECISA consumir `useTalkXLiveChannel`. Isso quebrou 3 testes que renderizam o Monitor com um mock de
  `supabase.channel` de 2 níveis (`TypeError: nextChannel.on(...).on(...).on is not a function`) em
  kpiRow/lifecycle/TalkXHealthCard. Deixá-los vermelhos seria quebrar teste existente (pior que a regra de
  arquivos); corrigi 1 linha de mock em cada um. São 3 arquivos de TESTE, e nenhum arquivo de produto além
  do `TalkXLiveMonitor.tsx`. Se a intenção era realmente só 2 arquivos, o cartão precisa decidir quem
  conserta esses mocks — mas a suíte ficaria vermelha para o integrador.
- `?? undefined` no 3º argumento: o hook expõe `panelPollMs: number | null` e o parâmetro de
  `useTalkXMonitor` é `number | false | undefined`; sem a ponte `null → undefined` o `tsc` do app
  (strictNullChecks) reprova o arquivo. Não é escolha estética.
- Não toquei em `useTalkXLiveChannel.ts`, `useTalkXMonitor.ts`, `useTalkXMonitorPanel.ts`,
  `talkxStates.matrix.test.tsx` nem `TalkXCampaignRunning.*` (escopo do cartão pai, já integrados).
