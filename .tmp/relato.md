Especialista: hugo
## O que mudou e por quê
- src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx:26: DIRETORIOS passa a incluir `join(RAIZ, 'components')` — a guarda cobria hooks/services/lib e deixava `src/components` fora do alcance (critério 2).
- src/components/alerts/EvolutionDisconnectBanner.tsx:46: `.channel('disconnect-banner')` vira `.channel(uniqueRealtimeTopic('disconnect-banner'))` (imports :3-:4) — era o único literal fixo em components; dois banners montados derrubavam a tela.
- src/components/alerts/EvolutionDisconnectBanner.tsx:39: `useRealtimeReconnect(() => { void fetchStatus(); })` — um "disconnected" gravado durante a queda não é reentregue; sem isso o aviso ficava escondido até o próximo UPDATE (ponto 3, item do banner).
- 6 arquivos novos de teste (*.reconexao.test.tsx): cobrem os 5 hooks do ponto 2 + o banner (ponto 3). Nenhum outro arquivo de produção foi tocado.
## Prova
- Ponto 1, vermelho antes (guarda ampliada, banner ainda fixo): `vitest run src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx` → `FAIL ... EvolutionDisconnectBanner.tsx:39 -> .channel('disconnect-banner'): expected [ Array(1) ] to deeply equal []` (Test Files 1 failed, Tests 1 failed).
- Ponto 1, verde depois: mesmo comando → `Test Files 1 passed (1); Tests 1 passed (1)`.
- Ponto 2, vermelho antes (linha `useRealtimeReconnect` comentada em cada hook, teste novo rodado): useWarRoomAlerts → `expected "vi.fn()" to be called 3 times, but got 2 times`; useGmail → 1 failed; useNotifications → `expected "vi.fn()" to be called 2 times, but got 1 times`; useConnectionsManager → `expected 2 times, but got 1 times`; useEvolutionMonitoring → `expected 2 times, but got 1 times`. Cada vermelho foi restaurado com `git checkout -- <hook>` (meu diff não altera esses 5 hooks).
- Ponto 2/3, banner vermelho antes (só a linha :39 comentada): `EvolutionDisconnectBanner.reconexao.test.tsx` → `Tests 1 failed | 1 passed` (`expected 2 times, but got 1 times` no teste de reconexão; o de tópico exclusivo passou).
- Verde depois, suíte do cartão (9 arquivos): `vitest run <guarda> <2 reconexao existentes> <6 novos>` → `Test Files 9 passed (9); Tests 12 passed (12)` (7 novos em 6 arquivos + 5 preexistentes em 3 arquivos).
- Typecheck: `tsc -b --force` → saída vazia, exit 0.
- Lint nos 8 arquivos do diff: só 2 achados no banner, ambos preexistentes (provado no HEAD via `eslint --stdin`: warning `no-restricted-imports` 2:1 e error `set-state-in-effect` 35:10). Não mexi para manter o diff mínimo.
## Pontos do revisor
- Ponto 1: resolvido — guarda ampliada (guarda.test.tsx:26) + banner com tópico exclusivo (EvolutionDisconnectBanner.tsx:46); prova vermelho→verde acima.
- Ponto 2: resolvido — 5 testes que disparam `online` e provam revalidação: `src/hooks/business/__tests__/useWarRoomAlerts.reconexao.test.tsx` (from 2→3), `src/hooks/integrations/__tests__/useGmail.reconexao.test.tsx` (email_threads 2→4), `src/hooks/system/__tests__/useNotifications.reconexao.test.tsx` (from 1→2), `src/hooks/inbox/__tests__/useConnectionsManager.reconexao.test.tsx` (from 1→2), `src/components/monitoring/hooks/__tests__/useEvolutionMonitoring.reconexao.test.tsx` (fetchData 1→2). Os 5 hooks já revalidavam (entrega anterior); o que faltava era a prova, agora com vermelho→verde por hook.
- Ponto 3: banner TRATADO (EvolutionDisconnectBanner.tsx:39 + teste de reconexão do banner, from 1→2); useAgentPresence e WhisperMode NÃO TRATADOS, justificados com fato de código: presence se autorregenera pelo heartbeat de 25 s (useAgentPresence.ts:15,118,121) + staleTimer de 25 s com STALE_MS de 75 s (:18,121) e SELECT inicial no join (:95-106) — heartbeats contínuos dos colegas ressincronizam em ~25-50 s após o rejoin; WhisperMode tem `refetchInterval: 10000` na query de whispers (WhisperMode.tsx:320) + invalidação no INSERT — defasagem limitada a 10 s.
- Ponto 4: primeira linha deste relato é exatamente `Especialista: hugo`. Contagem honesta: a suíte deste cartão tem 9 arquivos e 12 testes (7 novos em 6 arquivos; 5 preexistentes em 3 arquivos) — corrige o "8 suítes, 34 testes" do relato anterior. Fica sem revalidar, nominalmente: useAgentPresence (heartbeat/stale, item do ponto 3); WhisperMode (polling 10 s, item do ponto 3); useTeamChatNotifications (só toast/som de mensagem nova, :212, sem estado de painel); useTranscriptionNotifications (só toast de transcrição, sem painel; o interval :126 é só limpeza de ids); useSLANotifications (só toast de breach, :47-48); useTerminoRemoto (sinal terminal de chamada via CallSessionProvider, só age na sessão em curso); useTypingPresence/useTeamTyping (indicadores efêmeros com timeout próprio); useTeamPresence e ViewersIndicator (presence efêmero, sem painel persistente); useMyWorkItems (polling 60 s, :709); useRealtimeDashboard (refresh 5 min + intervalos, :344,366); MultiplixMonitor (polling 5 s, :248); TalkXCampaignRunning (polling 15/30 s); TalkXLiveMonitor (REFETCH + tick 1 s); useDiagnosticsData (sonda on-demand, nome fixo permitido na guarda); useTeamMessages/useTeamMessageReactions (invalidam no evento; sem revalidar no reconnect — fora do escopo do pedido original, sugiro cartão filho); realtime.service.ts (serviço subscribeTo*, revalidação cabe ao consumidor, sem painel próprio).
## O que NÃO fiz e por quê
- Não corrigi os 2 achados de lint preexistentes no banner (estão idênticos no HEAD; corrigi-los incharia o diff fora dos pontos da recusa).
- Não mexi nos 5 hooks do ponto 2 (já revalidavam; meu diff com eles é zero — só os testes novos os exercitam).
- Não tratei useAgentPresence nem WhisperMode com código novo (justificativa com fato de código, permitida pelo ponto 3; tratar exigiria teste novo para cada um e aumentaria o diff).
- Branch: reutilizei o branch/worktree da entrega anterior (`v2/realtime-reconexao-canais-unicos-2610131457e714`, só contém o commit aafe2e5 deste cartão sobre dia/2026-10-13 + meus commits) porque o guard bloqueia `checkout -b`/`worktree add` e o `hermes-tarefa-iniciar` está congelado (CONGELADO sem MODO_V2). Nenhum commit de outro cartão no branch.
## Arquivos (`git diff --name-only` + novos)
- M src/components/alerts/EvolutionDisconnectBanner.tsx
- M src/hooks/__tests__/canaisRealtimeNomeFixo.guarda.test.tsx
- N src/components/alerts/__tests__/EvolutionDisconnectBanner.reconexao.test.tsx
- N src/components/monitoring/hooks/__tests__/useEvolutionMonitoring.reconexao.test.tsx
- N src/hooks/business/__tests__/useWarRoomAlerts.reconexao.test.tsx
- N src/hooks/inbox/__tests__/useConnectionsManager.reconexao.test.tsx
- N src/hooks/integrations/__tests__/useGmail.reconexao.test.tsx
- N src/hooks/system/__tests__/useNotifications.reconexao.test.tsx
CONCLUÍDO: 4/4 pontos da recusa resolvidos; suíte 9 arquivos 12 testes verde; tsc exit 0.
