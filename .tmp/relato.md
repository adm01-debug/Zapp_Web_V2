Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/adapters/inboxAdapter.ts: novo resolvedor `resolveFirstResponseCycleStart` (início do ciclo ABERTO do cronômetro de 1ª resposta) e `mapRealtimeConversationToConversation` passa a usá-lo, em vez de olhar só a linha aberta do banco — a linha do `conversation_sla` nasce quando alguém responde, então o cliente que escrevia DEPOIS de ser respondido ficava sem timer (`firstResponseAt` continuava na última resposta).
- src/components/inbox/VirtualizedRealtimeList.tsx: a base do timer da linha deixa de ser a linha histórica fechada / `created_at` do contato e passa a ser o ciclo aberto; sem ciclo aberto a linha não mostra timer (antes o `created_at` do contato prendia o timer num atendimento antigo).
- src/components/inbox/chat/ChatPanelHeader.tsx: consumidor direto do valor — passa a base do timer pelo mesmo resolvedor (era `conversation.createdAt`, a criação do contato); sem ciclo aberto mantém a base anterior.
- Testes: inboxAdapter.test.ts (5 casos do resolvedor + 2 do mapeamento), VirtualizedRealtimeList.test.tsx (3 casos na lista real, com o SLAIndicator recebendo as props reais), ChatPanelHeader.test.tsx (2 casos no cabeçalho real, o melhor e o pior caso).

Regra do ciclo: ciclo aberto = (a) linha aberta do `conversation_sla` (canônica do servidor) quando as mensagens carregadas não mostram resposta humana posterior a ela (linha aberta obsoleta é ignorada, para não prender o timer); senão (b) a última mensagem do cliente sem resposta humana depois, derivada das mensagens carregadas. Resposta humana = `sender='agent'` com status diferente de `sending`/`failed` (mesma regra do banco e do adapter). Sem ciclo aberto o resolvedor devolve `null` e a tela não mostra timer.

## Prova
- vermelho antes: `npx vitest run src/adapters/__tests__/inboxAdapter.test.ts src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx` com os 3 pontos de chamada revertidos ao código anterior (helper mantido) → `Tests  4 failed | 41 passed (45)`; falhas: "volta a ser null quando o cliente escreve depois da ultima resposta" (`AssertionError: expected 2026-01-01T00:10:00.000Z to be null`), "cliente escreveu depois da resposta: o timer comeca na mensagem nova, nao no atendimento antigo" (`expected "vi.fn()" to be called 1 times, but got 0 times`), "linha aberta obsoleta (resposta humana registrada depois) nao mantem o timer preso" (`expected "vi.fn()" to not be called at all, but actually been called 1 times`) e "PB-34: com nova mensagem do cliente, o timer comeca nela".
- verde depois: mesmo comando com a correção → `Test Files  3 passed (3)` / `Tests  45 passed (45)`.
- regressão da área: `npx vitest run src/components/inbox src/adapters src/hooks/inbox src/components/omnichannel` → `Test Files  229 passed (229)` / `Tests  1859 passed | 1 expected fail | 1 todo`.

## O que NÃO fiz e por quê
- Não trouxe o range do pai t_b7ea35bb (sha 2e68a1bf5): o pai está rejeitado pelo revisor ("refazer 1", diff gigante) e o conteúdo dele é banco/Edge, não da minha área. A tela funciona nos dois estados — com a linha aberta do PB-40 ela é a fonte canônica; sem ela, o ciclo é derivado das mensagens. Nenhum teste depende daquele SQL. Registrado em comentário no cartão.
- src/pages/ChatPopup.tsx monta o `Conversation` por conta própria (select em `contacts` sem o embed `conversation_sla` e `firstResponseAt` = 1ª mensagem do atendente) — mesmo defeito, mas fora dos ARQUIVOS QUE PODE TOCAR deste cartão; apontado em comentário para cartão próprio.
- Nenhum SQL, migration, Edge ou dependência nova. Único arquivo além dos citados é `ChatPanelHeader.tsx`, que é consumidor direto do valor mudado e vive em src/components/** (minha área).

Estados da tela: o que mudou é a presença/base do timer — sem ciclo aberto o selo não aparece (caso testado); vazio, carregando e erro da lista não foram tocados (nenhuma consulta mudou).

Concluí: o critério de pronto está cumprido — o cronômetro reinicia a cada nova mensagem do cliente, usa o ciclo aberto do `conversation_sla` quando existe e não fica preso em atendimento antigo —, com prova vermelho→verde e a suíte da área verde.
