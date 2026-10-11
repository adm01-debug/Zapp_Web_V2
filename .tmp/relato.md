Especialista: senior (area-front-hooks)

## Pontos do revisor
- Ponto 1: reproduzi o vermelho da recusa no snapshot do commit recusado `38a426c83`, sem mexer na suíte: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 failed (1); Tests 7 failed (7); Error: No QueryClient set, use QueryClientProvider to set one`. Isso confirma que a quebra vinha da nova chamada real a `useTalkXConnectionStatus` dentro de `TalkXCampaignScheduled`.
- Ponto 2: corrigi o caminho quebrado sem apagar teste, pular teste ou afrouxar asserção. Em `TalkXCampaignScheduled.calendario.test.tsx`, `TalkXCampaignScheduled.lifecycle.test.tsx`, `TalkXCampaignScheduled.states.test.tsx` e `TalkXCampaignScheduled.test.tsx`, adicionei mock explícito de `useTalkXConnectionStatus` para os testes que renderizam a tela agendada; o teste principal também mantém controle do status no `h.connection` para provar linha desconectada/conectada. Prova verde do arquivo recusado: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- Ponto 3: rodei a suíte da tela agendada depois da correção e a verificação rápida. `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 4 passed (4); Tests 38 passed (38)`. `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.
- Mantive o trabalho anterior no escopo do pedido original: `TalkXCampaignScheduled.tsx` usa `campaignBlockingChecks` com o status real da conexão, o botão de envio fica bloqueado quando há pendências, o alerta lista os bloqueios, e `talkxScheduleStatus.ts` concentra a formatação do selo e a regra pura das pendências.

## Arquivos do diff
src/components/talkx/TalkXCampaignScheduled.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx
src/components/talkx/talkxScheduleStatus.ts

## Verificações executadas
- vermelho antes: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` no snapshot `38a426c83` → `Test Files 1 failed (1); Tests 7 failed (7); Error: No QueryClient set, use QueryClientProvider to set one`.
- verde depois: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- suíte relacionada: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 4 passed (4); Tests 38 passed (38)`.
- verificação: `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.

## O que não fiz
- Não removi teste, não pulei teste e não relaxei as asserções do calendário; só alinhei o mock da nova dependência usada pela tela.
- Não toquei em banco, Edge Function, CI, manifesto ou produção.
