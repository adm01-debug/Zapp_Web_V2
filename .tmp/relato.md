Especialista: senior (area-front-hooks)

## Pontos do revisor
- Ponto 1: a recusa dizia que a entrega anterior quebrou `src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` porque `TalkXCampaignScheduled` passou a chamar `useTalkXConnectionStatus` sem `QueryClientProvider`/mock nesse teste. Corrigi nos testes que renderizam a tela agendada (`TalkXCampaignScheduled.calendario.test.tsx`, `TalkXCampaignScheduled.lifecycle.test.tsx`, `TalkXCampaignScheduled.states.test.tsx` e `TalkXCampaignScheduled.test.tsx`) adicionando mock explícito do hook de status de conexão, sem remover nem afrouxar as asserções existentes. Prova vermelha antes no snapshot do commit recusado `38a426c83`: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 failed (1); Tests 7 failed (7); Error: No QueryClient set, use QueryClientProvider to set one`. Prova verde depois no commit atual: o mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`.
- Mantive o trabalho anterior no escopo do pedido original: `TalkXCampaignScheduled.tsx` usa `campaignBlockingChecks` com o status real da conexão, o botão de envio fica bloqueado quando há pendências, o alerta lista os bloqueios, e `talkxScheduleStatus.ts` concentra a formatação do selo e a regra pura das pendências. O teste principal cobre linha desconectada, linha conectada, mensagem vazia e campanha válida.

## Arquivos do diff
src/components/talkx/TalkXCampaignScheduled.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx
src/components/talkx/talkxScheduleStatus.ts

## Verificações executadas
- `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 4 passed (4); Tests 38 passed (38)`.
- `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.

## O que não fiz
- Não removi teste, não pulei teste e não relaxei as asserções do calendário; só alinhei o mock da nova dependência usada pela tela.
- Não toquei em banco, Edge Function, CI, manifesto ou produção.
