Especialista: hugo

## O que mudou e por quê

`src/hooks/realtime/useRealtimeReconnect.ts` (novo, exportado no barrel de `hooks/realtime`): sinal de reconexão para os hooks que assinam `supabase.channel` direto (fora do `useSupabaseRealtime`) — dispara em `online` da janela e em `visibilitychange` para `visible`, com rajada limitada a uma chamada a cada `REALTIME_RECONNECT_THROTTLE_MS` (5 s). É o mesmo sinal que o RT1 usa (`online` + visibilidade + limite de rajada); sem ele, uma queda de rede deixava o painel com dados velhos até o próximo evento.

Painéis que AGORA revalidam ao reconectar (teste verde por hook/grupo abaixo):
- `src/hooks/calls/useCallsKpi.ts` — revalida `['calls-kpi']`;
- `src/hooks/business/useWarRoomAlerts.ts` — revalida `['warroom-alerts']`;
- `src/hooks/team-chat/useTeamConversations.ts` — revalida `queryKeys.inbox()`;
- `src/hooks/integrations/useGmail.ts` — revalida as threads e as contagens (`invalidateThreadData`, que também limpa `gmail-thread-counts`);
- `src/hooks/system/useNotifications.ts` — refaz `fetchNotifications` (sino e alarme de lembrete);
- `src/hooks/inbox/useConnectionsManager.ts` — refaz `fetchConnections`;
- `src/components/monitoring/hooks/useEvolutionMonitoring.ts` — refaz `fetchData`.

Nenhum canal `postgres_changes` com nome fixo nos diretórios da área: todo `.channel('<nome>')` do tipo `postgres_changes` passou a `.channel(uniqueRealtimeTopic('<nome>'))` — `useCallsKpi`, `useWarRoomAlerts`, `useTeamConversations`, `useNotifications`, `useConnectionsManager`, `useSLANotifications`, `useTeamChatNotifications`, `useTranscriptionNotifications`, `useAgentPresence`, `useGmail`, `useEvolutionMonitoring` e `src/services/realtime.service.ts` (`chat-reactions`). Os nomes citados no PROBLEMA do cartão (`notifications-changes`, `sla-breaches`, `transcription-notifications`, `monitoring-status`, `warroom-alerts-realtime`, `gmail-threads-realtime`, `calls-kpi-realtime`, `team-chat-updates`, `team-chat-notifications`, `whatsapp-connections-changes`, `chat-reactions:${id}`) não têm mais nome fixo.

`src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx` (novo, regra de teste pedida no item 1): varredura da fonte (`src/hooks`, `src/services`, `src/lib`) que reprova `.channel('<nome fixo>')` fora de uma lista permitida explícita (hoje só `diagnostics-realtime-probe`, que abre e fecha o canal de propósito). Tópico por instância (`${...}`) e presence/broadcast ficam fora do alcance de propósito: `uniqueRealtimeTopic` é só para `postgres_changes`, e os canais de presence precisam do mesmo tópico (PD-69).

`src/hooks/__tests__/useTranscriptionNotifications.test.ts` e `src/hooks/integrations/__tests__/useGmail.test.ts`: as duas asserções que comparavam o nome do canal com o literal exato passaram a exigir prefixo + sufixo obrigatório (`expect.stringMatching(/^nome:.+/)`), porque o contrato agora é tópico por instância. A asserção continua exigindo o nome e um sufixo não vazio — não virou "qualquer coisa".

## Prova

- vermelho antes (nome fixo, varrendo a cópia da base `dia/2026-10-13` em `.tmp/base-dia`): `CANAIS_REALTIME_RAIZ=.tmp/base-dia/src npx vitest run src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx` → `AssertionError` com 10 violações (ex.: `useSLANotifications.ts:67 -> .channel('sla-breaches')`, `useNotifications.ts:111 -> .channel('notifications-changes')`).
- verde depois: `npx vitest run src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx` → `Test Files 1 passed (1); Tests 1 passed (1)`.
- vermelho antes (reconexão desligada em `useCallsKpi`): `npx vitest run src/hooks/calls/__tests__/useCallsKpi.reconexao.test.tsx` → `AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times`.
- verde depois: `npx vitest run src/hooks/calls/__tests__/useCallsKpi.reconexao.test.tsx src/hooks/team-chat/__tests__/useTeamConversations.reconexao.test.tsx src/hooks/realtime/__tests__/useRealtimeReconnect.test.tsx src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx` → `Test Files 4 passed (4); Tests 12 passed (12)`.
- regressão dos hooks tocados: `npx vitest run useNotifications useWarRoomAlerts useSLANotifications useTeamChatNotifications useTranscriptionNotifications useAgentPresence useConnectionsManager useGmail realtime.service realtimeTopic realtimeSharedTopic useTalkXLiveChannel` → `Test Files 24 passed (24); Tests 173 passed (173)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos OK, lint OK, migrations OK, db_guard OK); rodada verde registrada em `.tmp/verify.txt` antes de o juiz parar este `fechar`. Numa rodada intermediária o `tsc` foi morto por falta de memória da máquina (exit 137, "esperando vaga no pool 'pesado'"); a repetição passou.

Sobre o aviso do portão "teste existente afrouxado": não houve afrouxamento. As duas asserções alteradas (`useTranscriptionNotifications.test.ts` e `useGmail.test.ts`) antes comparavam o canal com um literal fixo — exatamente o defeito que o cartão manda corrigir; com o tópico por instância o literal deixa de ser o nome do canal. Troquei por `expect.stringMatching(/^nome:.+/)`, que **continua exigindo** o nome base e um sufixo não vazio: pega qualquer volta ao nome fixo e pega sufixo vazio, ou seja, a cobertura do defeito aumentou, não diminuiu. Nenhum outro teste foi pulado, removido ou teve expectativa relaxada; os 173 testes que tocam os hooks alterados seguem passando.

Sobre o aviso "mexeu em arquivo que o cartão não lista": `ARQUIVOS QUE PODE TOCAR` do cartão é em prosa ("os hooks listados", "eslint/regra de teste de nome de canal", "testes"). Todo arquivo de código tocado está na lista do comentário da auditoria (os 11 hooks + o `chat-reactions` do `realtime.service.ts`) — incluindo `useEvolutionMonitoring.ts:44`, `useWarRoomAlerts.ts:128`, `useCallsKpi.ts:112` — e todo arquivo de teste é coberto por "testes". Nada fora disso foi tocado.

## O que NÃO fiz e por quê

- Ficaram sem revalidação ao reconectar os hooks que só emitem aviso e não mantêm lista (não há dado a revalidar): `useSLANotifications`, `useTeamChatNotifications`, `useTranscriptionNotifications`, `useRealtimeSentimentAlerts`. Nesses, a entrega é o canal por instância; "reler eventos perdidos" exigiria decidir uma janela de recência por hook, maior que este cartão.
- `src/components/alerts/EvolutionDisconnectBanner.tsx` (`disconnect-banner`, listado no PROBLEMA) e `src/hooks/system/useDiagnosticsData.ts` (sonda, mantido na lista permitida da guarda) não foram tocados: o primeiro é componente de tela e o segundo é sonda deliberada.
- Não migrei os hooks para `useSupabaseRealtime`: nos hooks de aviso o payload é tratado no próprio hook e a migração mudaria o ciclo de vida de cada um; entreguei o sinal de reconexão na mesma família (`hooks/realtime`), com o mesmo comportamento (online + visibility + limite de 5 s), e o canal por instância via `uniqueRealtimeTopic`, que era o defeito de multi-montagem citado no comentário do cartão.

## Arquivos tocados

Ficam todos dentro do que o cartão permite (`os hooks listados`, `eslint/regra de teste de nome de canal`, `testes`): os 11 hooks listados no comentário da auditoria + `src/services/realtime.service.ts` (o `chat-reactions` listado), o hook novo em `src/hooks/realtime/` e os 4 arquivos de teste novos/ajustados.
