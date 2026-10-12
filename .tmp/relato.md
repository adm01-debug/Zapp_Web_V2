Especialista: senior (componentes Talk X; refazer)

## O que mudou e por quê
- Reempilhei a correção da tela agendada sobre a ponta atual de `dia/2026-10-11`, trazendo só os commits efetivos de código/teste do refazer anterior (`38a426c83` e `1841641d7`; o topo `3f3d6539f` era apenas relato). O commit final deste refazer é `52758f6c8`.
- `src/components/talkx/TalkXCampaignScheduled.tsx`: a Tela 10 volta a importar e usar `useTalkXConnectionStatus` e a função pura `campaignBlockingChecks`, então o selo "pronta" só aparece quando linha, público e mensagem estão válidos; mantém a correção do calendário/linha do tempo que o pedido original exigia.
- `src/components/talkx/talkxScheduleStatus.ts`: centralizei `formatTalkXScheduleLabel` e `campaignBlockingChecks` para os ramos da tela e dos testes chamarem a mesma regra real.
- Testes Talk X: mantive as asserções do calendário e acrescentei cobertura do status real em `TalkXCampaignScheduled.test.tsx`, além de alinhar os mocks de conexão nos demais testes da tela agendada. Não removi, pulei nem afrouxei teste.

## Pontos do refazer
- Ponto 1: reproduzir a falha. Sobre a base atual, apliquei o commit original recusado `f33b8d141` com `git cherry-pick -n -X theirs f33b8d141` e rodei `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → vermelho: `Test Files 1 failed (1)` / `Tests 7 failed (7)` com `ReferenceError: useTalkXConnectionStatus is not defined` em `TalkXCampaignScheduled.tsx:158`.
- Ponto 2: corrigir sem recomeçar. Reapliquei a correção restrita (`git cherry-pick -n c350a2896`, equivalente aos commits de código `38a426c83` + `1841641d7`) e deixei o diff só nos 6 arquivos Talk X da entrega original/refazer; nada de Contacts, CI, migration ou manifesto entrou no commit.
- Ponto 3: provar verde. O mesmo teste do pedido passou depois da correção, o teste de Contacts citado na recusa atual também passou empilhado com os testes Talk X, e `zapp-verify . --rapido` ficou verde sem banco.

## Prova
- vermelho antes: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` após aplicar `f33b8d141` → `Test Files 1 failed (1)` / `Tests 7 failed (7)` / `ReferenceError: useTalkXConnectionStatus is not defined`.
- verde depois: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 1 passed (1)` / `Tests 7 passed (7)`.
- regressão do empilhamento citada na recusa: `bun run test src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 5 passed (5)` / `Tests 41 passed (41)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (114s)`.
- tentativa de `zapp-verify full .`: passou por `db_guard`, `tipos`, `lint` e `migrations`, mas ficou mais de 20 minutos sem avançar depois do aviso de banco local sem conjunto; matei o processo para não prender a fila. A prova de produto acima cobre o arquivo original e o arquivo citado na recusa atual.

## Arquivos do diff
src/components/talkx/TalkXCampaignScheduled.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx
src/components/talkx/talkxScheduleStatus.ts

## O que NÃO fiz e por quê
- Não alterei `ContactFormRecalculoCorrida.test.tsx`: a falha citada na recusa atual já fica coberta por rodar esse teste junto com a suíte Talk X; o diff necessário é restrito ao Talk X.
- Não toquei em banco, Edge Function, CI, dependências, manifests ou arquivos fora do escopo do cartão.
