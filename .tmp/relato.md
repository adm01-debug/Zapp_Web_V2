Especialista: senior (area-testes-do-produto)

## O que mudou e por quê
- Reempilhei a entrega recusada a partir do sha pedido `3f3d6539f`: o topo `3f3d6539f` era relato, então trouxe os commits efetivos da mesma branch (`38a426c83` e `1841641d7`) em um commit novo sobre a ponta atual de `dia/2026-10-11`.
- `src/components/talkx/TalkXCampaignScheduled.tsx` e `src/components/talkx/talkxScheduleStatus.ts`: mantêm a extração do status real da tela agendada e o bloqueio memoizado da conexão Talk X.
- Testes de `src/components/talkx/__tests__/TalkXCampaignScheduled*.tsx`: mantêm os mocks de conexão/query client que cobrem a chamada real nova e preservam as asserções.

## Pontos do refazer
- Ponto 1: parti da entrega `3f3d6539f` por cherry-pick da branch anterior; o commit final contém os arquivos de código/teste efetivos dos commits `38a426c83` e `1841641d7`, com os commits de relato da entrega anterior fora do diff.
- Ponto 2: executei o cenário pedido sobre a ponta atual de `dia/2026-10-11` com a entrega reempilhada: `bun run test src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx` → `Test Files 1 passed (1)` / `Tests 3 passed (3)`. O teste de contatos ficou preservado.
- Ponto 3: provei o empilhamento verde com o mesmo comando, com os testes Talk X da entrega anterior e com `zapp-verify . --rapido`; commit novo deste refazer: `c350a2896`.

## Prova
- contato pedido pelo cartão: `bun run test src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx` → `Test Files 1 passed (1)` / `Tests 3 passed (3)`.
- regressão da entrega reempilhada: `bun run test src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx` → `Test Files 4 passed (4)` / `Tests 38 passed (38)`.
- verificação: `zapp-verify . --rapido` → `OK db_guard`; `OK tipos`; `OK lint`; `OK migrations`; `VERIFY: VERDE SEM BANCO`.

## Arquivos do diff
.tmp/relato.md
src/components/talkx/TalkXCampaignScheduled.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.lifecycle.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.states.test.tsx
src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx
src/components/talkx/talkxScheduleStatus.ts

## Escopo preservado
- `src/components/contacts/__tests__/ContactFormRecalculoCorrida.test.tsx` ficou fora do diff porque o comando pedido passou verde com a entrega reempilhada.
- O diff ficou restrito aos arquivos Talk X da entrega original e ao relato deste cartão.
