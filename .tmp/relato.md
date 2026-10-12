Especialista: senior (componentes Talk X; refazer)

## O que mudou e por quê
- Reempilhei a correção da tela agendada sobre a ponta atual de `dia/2026-10-11`, trazendo só os commits efetivos de código/teste do refazer anterior (`38a426c83` e `1841641d7`; o topo `3f3d6539f` era apenas relato). O commit final de código deste refazer é `52758f6c8`.
- `src/components/talkx/TalkXCampaignScheduled.tsx`: a Tela 10 importa e usa `useTalkXConnectionStatus` junto com `campaignBlockingChecks`, então o selo "pronta" só aparece quando linha, público e mensagem estão válidos; a correção do calendário/linha do tempo do pedido original permanece intacta.
- `src/components/talkx/talkxScheduleStatus.ts`: centralizei `formatTalkXScheduleLabel` e `campaignBlockingChecks` para os ramos da tela e dos testes chamarem a mesma regra real.
- Testes Talk X: mantive as asserções do calendário e acrescentei cobertura do status real em `TalkXCampaignScheduled.test.tsx`, além de alinhar os mocks de conexão nos demais testes da tela agendada. Nenhum teste foi removido, pulado ou afrouxado.

## Pontos do refazer
- Ponto 1: reproduzi a falha. Sobre a base atual, apliquei o commit original recusado `f33b8d141` com `git cherry-pick -n -X theirs f33b8d141` e rodei `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → vermelho: `Test Files 1 failed (1)` / `Tests 7 failed (7)` com `ReferenceError: useTalkXConnectionStatus is not defined` em `TalkXCampaignScheduled.tsx:158`.
- Ponto 2: corrigi sem recomeçar. Reapliquei a correção restrita (`git cherry-pick -n c350a2896`, equivalente aos commits de código `38a426c83` + `1841641d7`) e deixei o diff só nos 6 arquivos Talk X da entrega original/refazer; nada de Contacts, CI, migration ou manifesto entrou no commit.
- Ponto 3: provei verde. O mesmo teste do pedido passou depois da correção, o teste de Contacts citado na recusa atual passou empilhado com os testes Talk X, e `zapp-verify . --rapido` ficou verde sem banco.

## Prova
- vermelho antes: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` após aplicar `f33b8d141` → `Test Files 1 failed (1)` / `Tests 7 failed (7)` / `ReferenceError: useTalkXConnectionStatus is not defined`.
- verde depois: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 passed (1)` / `Tests 7 passed (7)`.
- regressão do empilhamento citada na recusa: `bun run test src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 5 passed (5)` / `Tests 41 passed (41)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (114s)`.

## Arquivos do diff
src/components/talkx/TalkXCampaignScheduled.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx
src/components/talkx/talkxScheduleStatus.ts

## Fora do escopo mantido fora do diff
- `src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx` foi usado como prova de empilhamento e permaneceu sem alteração.
- Banco, Edge Function, CI, dependências e manifests permaneceram sem alteração.
