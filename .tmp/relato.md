Especialista: semisenior

## O que mudou e por quê (neste refazer; o resto veio da entrega anterior)

- `src/hooks/crm/useAgentPresence.ts`: a aba oculta NÃO pausa mais o heartbeat — `pauseForHiddenTab` limpa só o `staleTimer` (recálculo local) e o heartbeat de 25 s continua com a aba oculta, porque parar de mandar heartbeat faria o agente aparecer OFFLINE para os outros depois dos 75 s do STALE_MS, o contrário do "sem piscar" que o cartão pede. `resumeFromVisible` agora sempre republica o status e recalcula ao voltar para `visible` (antes saía cedo quando o heartbeat existia, então não republicava nada), e `join` com a aba já oculta liga o heartbeat e deixa só o recálculo para a volta.
- `src/hooks/inbox/useRealtimeInbox.ts`: o efeito de saída da Inbox agora registra um listener de `pagehide` que descarrega a fila (`flushPendingMarkRead(false)`), além do flush no desmontar — fechar/recarregar a aba não desmonta o React a tempo, e sem o listener o lote dentro da janela de 250 ms morria com o timer.
- `src/services/realtime.service.ts`: quando nenhum retry é agendado após falha transitória (tentativas esgotadas acima do máximo, ou saída com `allowRetry=false`), os ids são descartados de verdade (`pendingMarkRead` limpo), o contador é zerado e o log diz `retry exhausted; ids dropped` em vez do antigo `ids kept for retry`, que mentia — nenhum timer iria buscar aqueles ids.
- Testes: `useAgentPresence.visibilidade.test.ts` (o caso da aba oculta agora prova que o heartbeat continua e que nenhum upsert publica `offline`), `useRealtimeInbox.leituraLote.test.tsx` (caso novo dispara o evento `pagehide` de verdade), `realtime.service.markReadFlush.test.ts` (casos novos 11 de esgotamento e 12 de saída com erro transitório). Nenhum teste existente foi removido, pulado ou afrouxado — o caso 10 (erro de contrato) foi preservado.

## Pontos do revisor

- Ponto 1: resolvido — `src/hooks/crm/useAgentPresence.ts` (pause só do `staleTimer`, heartbeat mantido, republicação no `visible`); prova no teste `aba oculta mantém o heartbeat (sem offline publicado)` em `src/hooks/crm/__tests__/useAgentPresence.visibilidade.test.ts`.
- Ponto 2: resolvido — `src/hooks/inbox/useRealtimeInbox.ts` (listener `pagehide` + flush no desmontar); prova no teste `descarta o lote pendente no 'pagehide' (fechar/recarregar a aba)` em `src/hooks/inbox/__tests__/useRealtimeInbox.leituraLote.test.tsx`, que dispara `window.dispatchEvent(new Event('pagehide'))`.
- Ponto 3: resolvido — `src/services/realtime.service.ts` (descarte real + contador zerado + log `retry exhausted; ids dropped` quando não há retry agendado); prova nos testes 11 (`retries esgotados descartam os ids, zeram o contador`) e 12 (`saída com erro transitório descarta sem agendar retry`) em `src/services/__tests__/realtime.service.markReadFlush.test.ts`. O caso 11 ainda prova o zeramento: um lote novo após o esgotamento volta a ter retry agendado.
- Ponto 4: resolvido — este parágrafo substitui a frase antiga: o aviso de "padrão sensível" do portão não aponta código meu; o padrão verifyHmac|signature casou o texto do próprio relato (a frase que negava a presença dele), não arquivo de código — nenhum `.ts`/`.tsx` do diff contém esses tokens.

## FAIXA DO PAI (não é deste cartão)

- `src/hooks/chat/useRealtimeMessages.ts` (18 linhas), `src/components/inbox/ConversationListSidebar.tsx` (2 linhas) e `src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx` vêm do cherry-pick do cartão-pai (commit `23108b061`, "a lista de conversas não pisca mais"), já reconhecido na recusa como explicado. Eu não abri nem editei esses arquivos.

## Prova

- vermelho antes (fontes revertidas para o HEAD, só com meus testes): `npx vitest run src/services/__tests__/realtime.service.markReadFlush.test.ts src/hooks/crm/__tests__/useAgentPresence.visibilidade.test.ts src/hooks/inbox/__tests__/useRealtimeInbox.leituraLote.test.tsx` → `Test Files 3 failed (3); Tests 4 failed | 15 passed (19)` — os 4 testes novos/pontos falham sem a correção.
- verde depois (com a correção): `npx vitest run src/services/__tests__/realtime.service.markReadFlush.test.ts src/hooks/crm/__tests__/useAgentPresence.visibilidade.test.ts src/hooks/inbox/__tests__/useRealtimeInbox.leituraLote.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.leituraLote.test.tsx` → `Test Files 4 passed (4); Tests 21 passed (21)`.
- sem regressão na vizinhança: `npx vitest run src/hooks/crm/__tests__/useAgentPresence.test.ts src/services/__tests__/realtime.service.inbox-janela-global.test.ts src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx src/hooks/inbox/__tests__/` → `Test Files 24 passed (24); Tests 143 passed | 1 expected fail (144)`.
- segunda passada anti-defeito-novo: `flushPendingMarkRead` só é chamado pela Inbox (import + efeito); `pauseForHiddenTab`/`resumeFromVisible` são internos ao módulo de presença; o `void flush...` no listener não deixa `loading` preso nem rejeição sem dono (a função nunca rejeita — o erro vira log dentro dela).

## O que NÃO fiz e por quê

- Não editei `useRealtimeMessages.ts` nem `ConversationListSidebar.tsx`: faixa do pai (acima).
- Não pluguei `markManyMessagesAsRead` em tela: continua sem chamador de lote; fora do pedido.
- Não renomeei `pauseForHiddenTab` apesar de ela agora pausar só o recálculo: renomear não muda comportamento e o comentário acima dela documenta a semântica nova.

## Conclusão

Concluí o [refazer 1]: os 4 pontos da recusa estão resolvidos nos arquivos do cartão, cada um com teste que falha sem a correção e passa com ela, vizinhança verde e relato coerente com o diff.
