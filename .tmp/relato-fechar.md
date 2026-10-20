Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 21s;OK lint 4s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 18:14, gerados por máquina: valem mais que números escritos à mão)
```
 src/App.tsx                                        |  10 +
 ...seGlobalIncomingMessageAlerts.behavior.test.tsx | 225 +++++++++++++++++++++
 src/hooks/realtime/incomingAlertScope.ts           | 132 ++++++++++++
 src/hooks/realtime/openConversationStore.ts        |  39 ++++
 .../realtime/useGlobalIncomingMessageAlerts.tsx    | 103 ++++++++++
 src/hooks/realtime/useRealtimeNotifications.ts     |  57 +++++-
 6 files changed, 559 insertions(+), 7 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 8 passed (8)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:verifyHmac|signature


## O que mudou e por quê
- src/hooks/realtime/incomingAlertScope.ts: a decisão do aviso passa a ler a opção "avisar também da equipe" (supervisor) — `teamAlerts` no escopo, `setTeamAlertsEnabled` gravando a escolha em `localStorage` (`zapp:avisar-tambem-da-equipe`) e `useTeamAlertsPreference` devolvendo valor + setter para o interruptor do painel. Padrão é DESLIGADO: o que não está na lista (conversa de colega de fila) é NEGADO; `shouldAlertIncomingMessage` só responde SIM para conversa sem responsável, conversa própria, ou — com a opção ligada — conversa de outro atendente.
- src/hooks/realtime/__tests__/useGlobalIncomingMessageAlerts.behavior.test.tsx: 2 provas novas (supervisor com a opção LIGADA é avisado da conversa de colega; a preferência começa DESLIGADA, liga, grava e mantém módulo e tela em sincronia), e `localStorage.clear()` no `beforeEach` para não vazar escolha entre testes.
- src/hooks/realtime/useRealtimeNotifications.ts, src/hooks/realtime/useGlobalIncomingMessageAlerts.tsx, src/hooks/realtime/openConversationStore.ts: só comentário — os que diziam "montado no AppShell" passam a dizer o lugar onde o consumidor global realmente vive (`App.tsx`/DeferredProviders), para o texto não prometer o que o código não faz.
- src/App.tsx (do commit anterior 656455c6e4, ver "Escopo" abaixo): monta `useGlobalIncomingMessageAlerts` dentro de `DeferredProviders`, ao lado de `TeamChatNotificationsListener`.

## Prova
- vermelho antes: `git show HEAD:src/hooks/realtime/incomingAlertScope.ts > src/hooks/realtime/incomingAlertScope.ts` (versão SEM a opção) e `npx vitest run src/hooks/realtime/__tests__/useGlobalIncomingMessageAlerts.behavior.test.tsx` →
  `TypeError: setTeamAlertsEnabled is not a function` e `TypeError: useTeamAlertsPreference is not a function`; `Tests 2 failed | 6 passed (8)`.
- verde depois: `npx vitest run src/hooks/realtime/__tests__/useGlobalIncomingMessageAlerts.behavior.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`; suíte do bairro `npx vitest run .../useGlobalIncomingMessageAlerts.behavior.test.tsx src/hooks/__tests__/useRealtimeNotifications.behavior.test.ts src/hooks/__tests__/useRealtimeMessages.test.tsx` → `Test Files 3 passed (3); Tests 20 passed (20)`.
- verificação: o bloco FATOS deste relato traz o resultado do `zapp-verify . --rapido` (o primeiro rodou FALHOU em lint — `react-hooks/set-state-in-effect` em incomingAlertScope.ts:82 — e foi corrigido no commit ff16f0dff7, que removeu o efeito e passou o valor inicial pelo `useState`).
- mudança que deu a primeira falha de lint: `ff16f0dff7` ("hook da preferencia nasce do modulo, sem setState em efeito"); o ratchet do commit já saiu `OK: nenhuma nova divida de lint foi introduzida`.

## Coordenação pedida pelo cartão (PH-44/45 e PE-30/31/32)
- Fonte: `~/hermes-workspaces/.assets/paridade-06/achados_2_realtime.md:72` — "Cartoes PE-30/31/32 cobrem so o contador e o titulo da aba; PH-44/45 so os caminhos de dentro do inbox." Já entregues, nos dois casos: PE-30/31/32 = contador de não lidas no menu e título da aba (linha 60 do mesmo achado); PH-44/45 = "aviso com a conversa certa aberta" (linha 41).
- O que NÃO estava feito e este cartão fecha: o aviso fora do inbox (o achado, linha 72: "Quem esta em Dashboard, Contatos, Tarefas, Telefonia, Talk X etc. nao ouve som nem recebe notificacao"). É o que o consumidor global montado em `DeferredProviders` entrega, sem repetir a regra que já mora em `useRealtimeNotifications.notifyAboutIncomingMessage`.

## Escopo: por que src/App.tsx
- O cartão autoriza "src/pages/ViewRouter.tsx ou o provedor de layout (confirme)". Confirmei: `DeferredProviders` (src/App.tsx:69-90) é o host dos listeners globais self-render que precisam de AuthProvider + QueryClient — é onde `TeamChatNotificationsListener` já mora (src/App.tsx:85). No ViewRouter o aviso só valeria dentro das views roteadas, e a evidência do achado (linha 72) é justamente o usuário em outra view/aba oculta; no AppShell (`components/layout/AppShell.tsx`) é área de telas e o arquivo não está na lista do cartão. Foram 2 linhas de import + 2 de chamada no App.tsx, publicando a identidade (`profile.id` de `useAuth`) para o resto decidir.

## Avisos do juiz barato e por que não procedem
- Aviso 1 ("a checagem de permissão parece deixar passar o que não está listado"): a regra é lista de BLOQUEIO com padrão DESLIGADO — só avisa conversa própria, sem dono, ou (opção do supervisor ligada) conversa de colega; o resto é NEGADO. `shouldAlertIncomingMessage` termina em `return currentScope.teamAlerts`, e `teamAlerts` nasce `false` (`resetIncomingAlertScope` e a leitura de `localStorage`). Prova: teste "não avisa conversa de outro atendente (o padrão é negado)" e, no teste da preferência, `expect(shouldAlertIncomingMessage({ assigned_to: 'perfil-2' })).toBe(false)`.
- Aviso 2 (src/App.tsx fora da lista): o cartão autoriza "src/pages/ViewRouter.tsx ou o provedor de layout (confirme)" — confirmei e escolhi o provedor de layout (`DeferredProviders` em src/App.tsx), que é onde `TeamChatNotificationsListener` já vive. O porquê está na seção "Escopo: por que src/App.tsx"; em App.tsx são 4 linhas (2 imports + 2 chamadas) e nenhuma regra.

## O que NÃO fiz e por quê
- Interruptor visual no painel de Configurações (arquivo de src/components/**): fora da lista de arquivos deste cartão e da minha área (telas). A opção está pronta e provada no estado; o card **t_0c6c3eff** (perfil iris), filho deste, abre o interruptor usando `useTeamAlertsPreference`, com o critério e os arquivos escritos nele.
- Persistência da opção em `user_settings` (coluna nova + RLS): trilha de banco; preferência de front grava em `localStorage`, como as outras escolhas de interface. Se o supervisor precisar da escolha em outro navegador, isso é migration aditiva, em outro cartão.
- Não mexi em `src/hooks/chat/useRealtimeMessages.ts` (citado como provável no achado): ele só chama `notifyAboutIncomingMessage` (linhas 92 e 128), que é o ponto único da decisão — mexer ali só repetiria a regra num segundo lugar.
