# Redesign das abas do Dashboard — STATUS
Branch: redesign/dashboard-abas-navy · Base: `origin/main` @ 7bb4c869 (HEAD real de trabalho: e051509f, só docs) · Worktree: `/workspace/repos/Zapp_Web_V2-abas`
Preview: `http://localhost:4175` (porta 4174 já ocupada pelo watchdog de `Zapp_Web_V2-dashboard` — ver Divergências) · PID: `/workspace/logs/redesign-abas-preview.pid`

## Contrato de funcionalidades (FASE 0)

### goals — `GoalsDashboard.tsx` + `useGoalsDashboard`
- Header com título, botão "Configurar Metas" (abre `GoalsConfigDialog`), select de período (`PERIOD_OPTIONS`: Hoje/Esta Semana/Este Mês).
- Card de progresso geral: `overallProgress` (0-100, média dos 3 goals), `completedGoals`/`goals.length`, barra de progresso, mensagem motivacional por faixa (100/75/50/<50).
- Grid de cards por meta (`goals[]`: id, label, description, target, current, unit, icon, color, priority) — só 3 tipos possíveis: `messages_sent`, `contacts_handled`, `resolution_rate` (cada um pode estar desativado via `goals_configurations`, aí não aparece). Cada card: valor atual/meta, barra de progresso, badge "Concluída" se `current >= target`, texto "Faltam N unidade" se não.
- `CelebrationOverlay` (confete) dispara ao completar 100% geral ou uma meta individual (efeito local, não é dado).
- Rodapé com frase motivacional + período formatado (`date-fns` ptBR).
- Handlers/estado: `period/setPeriod`, `configDialogOpen/setConfigDialogOpen`, `showCelebration/setShowCelebration/celebrationData` — todos vêm do hook, preservar 1:1.
- **Sem** categorização "Em risco"/"Em andamento"/"Em dia" no hook — é inferência nova (ver Divergências).
- **Sem** gamificação/leaderboard hoje nesta aba (Apêndice Z pede "Seu nível e progresso" via `useAgentGamification`/`useLeaderboard` — são hooks novos para este componente, não usados por ele hoje).

### ai — `AIQuickAccess.tsx` + `aiFeatures.ts`
- Header com badge "Ativo" (estático) e legenda "Modelo: Gemini 2.5 Flash" (texto fixo, não vem de hook/config real).
- Grid de 6 features de `AI_FEATURES` (id/title/description/icon/gradient/badge opcional `Popular`/`Novo`), clique = `useAIFeatureNavigation()(feature)` → `navigateToView('inbox')` ou `navigate(feature.route)`. **Preservar exatamente este mecanismo.**
- Rodapé com link "Ver todas as análises →" → `navigate('/sentiment-alerts')`.
- **Sem** dado real de "Análises Disponíveis"/"Alertas de Sentimento" hoje nesta aba — só texto estático. `useAIStats`/`useAIUsageDashboard` existem como hooks separados (não consumidos aqui ainda).

### sla — `SLAMetricsDashboard.tsx` + `useSLAMetrics(periodFilter)`
- Toggle de período (Hoje/Semana/Mês/Tudo) via `ToggleGroup`, estado local `periodFilter`.
- 4 KPIs: Taxa Geral SLA (`overall.overallRate`), No Prazo (`overall.firstResponse.onTime`), Violações (`overall.firstResponse.breached`), Total Conversas (`overall.totalConversations`).
- Lista "SLA por Agente" (`data.byAgent[]`: agentId, agentName, avatarUrl, overallRate, firstResponse.{rate,onTime,breached}) com barra de progresso por agente; empty state (`GenericEmptyState`) se vazio.
- Painel "Resumo Geral": barra da taxa geral + grid dos top 6 agentes por overallRate; embute `<SLAConfigurationManager />` (lazy, de `@/components/settings/`) quando há dados — **é o único ponto de configuração de SLA hoje nesta aba**, não há tabela de "Configurações Globais" própria aqui.
- Hook usa `loading` (não `isLoading`) — confirmado.

### team — `AgentPerformancePanel.tsx`
- Query própria direto no Supabase (`agent_stats` + `profiles`), **não usa `useLeaderboard`** hoje (o Apêndice Z pede migrar para `useLeaderboard`, que já expõe `agents`/`timeRange`/`setTimeRange`/`handleRefresh` — é troca de fonte, registrar).
- Ranking top 10 por XP: posição (1-3 = ícone Crown/Medal/Trophy, colorido), avatar, nome, badge nível (`Nv.N`), badge streak (🔥 se `streak>0`), métricas inline (mensagens enviadas, resolvidos, tempo médio formatado, satisfação se >0), barra de XP até o próximo nível (`xpForNext = (level+1)²×50`).
- `refetchInterval: 30000` (atualização automática) — preservar/equivalente via `useLeaderboard`.
- Empty state e loading state próprios.

### satisfaction — `SatisfactionMetrics.tsx` (+ `CSATDashboard.tsx` embutido pelo `DashboardView` logo abaixo, componentes irmãos não aninhados)
- `SatisfactionMetrics`: seletor de período (7d/30d/90d) local; hooks `useSatisfactionBreakdown(periodDays)` e `useNPSSurveys()`.
- 4 KPIs: CSAT (`breakdown.csatPercent`, cor por faixa, trend `up/down/stable` com pp), NPS (calculado localmente de `npsSurveys` filtrado por período: `(promotores-detratores)/total*100`), Respostas CSAT (`breakdown.totalResponses`), Top Agente (`breakdown.byAgent[0]`, clicável → abre `SatisfactionAgentRanking` dialog com `detailsOpen`).
- Distribuição de notas 1-5 (`breakdown.distribution`), gráfico de barras por fila (`breakdown.byQueue`, recharts), gráfico de linha "Evolução" (`breakdown.timeline`, recharts) — cada bloco com empty state próprio se sem dado (`hasCsatData`/`hasQueueData`/`hasTimelineData`).
- Erro de query → estado próprio com botão "Tentar novamente" (`refetchBreakdown`).
- `CSATDashboard` (separado, em `@/components/csat/`): tabs Hoje/Semana/Mês (`useCSAT(period)`), nota média + estrelas, distribuição 1-5 com barra, lista de feedbacks recentes (`surveys.filter(s => s.feedback)`).
- **Confirmado por Apêndice Z: aba sem dado real na base hoje — empty states são o comportamento correto.**

### sentiment — **DIVERGÊNCIA:** o componente real montado em `TabsContent value="sentiment"` (`DashboardView.tsx:178`) é `SentimentTrendChart.tsx`, não `SentimentTabContent.tsx`. `SentimentTabContent.tsx` (`OverviewTab`/`AgentsTab`/`AlertsTab`/`DistributionTab`) é consumido só por `SentimentAlertsDashboard.tsx` (rota `/sentiment-alerts`), fora do escopo desta entrega. Ver seção Divergências — reescrita será em `SentimentTrendChart.tsx`.
- `SentimentTrendChart`: select de período (7/14/30 dias) local, usa `useRealSentimentData(days)` de `SentimentHelpers.tsx` (confirmado — é este o hook certo, Z.6 acertou o hook, só errou o nome do arquivo-alvo).
- 4 stat cards (`SentimentStatsCards`): Score Médio (+ ícone smile/meh/frown + tendência recente vs anterior), % Positivo médio, % Negativo médio, Total de Alertas.
- Area chart (recharts) com séries Positivo/Negativo por dia, `ReferenceLine` em 50%, tooltip customizado (`SentimentCustomTooltip`).
- Props opcionais `onRefresh`/`onExport` (não usadas pelo `DashboardView` hoje — botões só aparecem se as props vierem).
- `useRealSentimentData` retorna `null` quando não há análises no período (nunca zera) — **preservar este contrato**.

### reports — `ScheduledReportsManager.tsx` (versão `dashboard/`, self-contained — NÃO confundir com `reports/ScheduledReportsManager` que usa `useScheduledReports()`)
- Query direta `scheduled_report_configs` (Supabase), mutations: `createConfig` (insert), `toggleActive` (update `is_active`), `deleteConfig` (delete). **Sem edit, sem send-now, sem campo de formato (pdf/csv)** — confirmar que a v2 desta aba não precisa desses recursos (não existem hoje, não inventar).
- `REPORT_TYPE_LABELS` (`performance`, `satisfaction`, `sla`, `conversations`, `agents`, `full`) e `FREQUENCY_LABELS` (`daily`, `weekly`, `biweekly`, `monthly`) — **reutilizar exatamente**, sem redefinir.
- Lista de relatórios: nome, badges tipo/frequência, contagem de destinatários, "último envio" relativo se houver; toggle ativo/inativo, botão excluir. Empty state próprio.
- Dialog "Novo Relatório": nome, tipo (select), frequência (select), destinatários (texto livre separado por vírgula — **não é chips**, confirmar antes de "melhorar" isso).

## Divergências plano × código (regra 0.3.13 / Z.13)
- **Porta do preview**: plano/Z.0.5 assume porta 4174 livre neste worktree. Na prática, 4174 já está ocupado por um `vite preview` do worktree `Zapp_Web_V2-dashboard` (watchdog externo, Z.2 proíbe tocar nele). Usei **porta 4175** neste worktree; PID em `/workspace/logs/redesign-abas-preview.pid`. Scripts de screenshot adaptados para aceitar a porta como argumento (`qa-dashboard/abasBeforeShots.mjs`).
- **Sentimento**: Apêndice Z manda reescrever `SentimentTabContent.tsx` + "wrapper usado no TabsContent". O wrapper real é `SentimentTrendChart.tsx` (confirmado via `DashboardView.tsx:178` e grep — `SentimentTabContent` só é importado por `SentimentAlertsDashboard.tsx`, fora de escopo). FASE 6 reescreve `SentimentTrendChart.tsx`, não `SentimentTabContent.tsx`.
- **Metas — categorização de status**: `useGoalsDashboard` não expõe "Em risco"/"Em andamento"/"Em dia" nem uma 4ª meta. Vou derivar os 4 KPIs e os status da tabela a partir do range de `getProgressColor` já exportado pelo hook (>=100 → Concluída/Em dia (success) · 75-99 → Em andamento (primary) · 50-74 → Atenção (warning) · <50 → Em risco (destructive)) — é reaproveitar a escala de cor já existente no código, não uma métrica nova inventada. "Metas do dia" (linha 127 do plano) na prática são as 3 metas do período selecionado (não há conceito de "meta diária" fixa separada do período).
- **Equipe**: painel atual não usa `useLeaderboard` (query própria a `agent_stats`+`profiles`). FASE 4 troca a fonte para `useLeaderboard` por instrução do Apêndice Z — campos que não existirem em `LeaderboardAgent` (ex.: mensagens enviadas, tempo de resposta) não são renderizados (ver regra Z.6), mesmo que o componente atual os mostre — registrado como não-regressão aceita (fonte de dado muda por decisão explícita do plano, não por perda de dado disponível).
- **Gate `typecheck-ratchet`**: script sai com `ERRO` (exit 2, não `FALHA` exit 1) por causa de `tsc -b` retornar status 2 nesta config de project-references — comportamento idêntico em `origin/main`/`7bb4c869` sem nenhuma mudança minha (confirmado via `git diff --stat 7bb4c869 HEAD` = só o apêndice). Baseline desta entrega = mesmo `ERRO`, mesmos 6 erros em `ThemeCustomizer.tsx`/`PresetCard.tsx`(×3)/`presets.ts`/`contact.service.ts` (bate com Z.10).
- **Gate `implicit-any-check`**: baseline interno do script é `0`, mas rodando sem tocar em nada (mesmo HEAD) aparecem 2 erros em `PresetCard.tsx:29` (mesmo cluster de dívida do `ThemeCustomizer`/tema, não mencionado explicitamente em Z.10 mas mesma causa raiz — `swatches`/`i` implícitos por `ThemePreset` não ter a propriedade `swatches`). Não vou tocar nesses arquivos de tema; meu gate por fase = **continuar em exatamente 2**, não zero.
- **Vitest do dashboard**: `npx vitest run src/components/dashboard` deu **47 testes em 13 arquivos** na FASE 0 (Z.9 dizia "68 testes"). Uso 47/13 como baseline real; gate por fase = não diminuir esse número (só crescer com os testes novos que eu adicionar, se adicionar).

## Blocos sem fonte de dado (empty state honesto)
- (a preencher por fase conforme cada bloco do mockup é confrontado com o hook real)

## Iterações do loop visual (máx 3 por fase)
-

## Pendências / resíduos
-

## CP0 [x] sha=e051509f (branch antes de qualquer commit meu) · before=abas-00-before-{goals,ai,sla,team,satisfaction,sentiment,reports}.png (out/, 0 console errors) · gates:
  - `grep -c dash tailwind.config.ts` = 12 (≥12 ok, Z.1)
  - `npm run typecheck` → 6 erros (ThemeCustomizer, PresetCard×3, presets.ts, contact.service.ts) — pré-existente, ver Divergências
  - `node scripts/ci/lint-ratchet.mjs` → baseline=1216 atual=1201 removidas=15 **novas=0** → OK
  - `node scripts/ci/typecheck-ratchet.mjs` → ERRO (exit 2, pré-existente, ver Divergências)
  - `npm run implicit-any-check` → 2 erros (baseline script=0) — pré-existente, ver Divergências
  - `npx vitest run src/components/dashboard` → **47 passed (13 files)** — baseline real (Z.9 previa 68)
## CP1 Metas          [ ] sha= · shot= · KPIs=[_,_,_,_] · empty states: _ · gates 5/5
## CP2 IA             [ ] sha= · shot= · features=6 · insights fonte=sim|não · gates 5/5
## CP3 SLA            [ ] sha= · shot= · export=ligado|omitido(motivo) · switch=mutation|disabled(motivo) · gates 5/5
## CP4 Equipe         [ ] sha= · shot= · ranking rows=_ · donut fonte=_ · gates 5/5
## CP5 Satisfação     [ ] sha= · shot= · blocos em empty: _ · CSATDashboard: embutido|abaixo (motivo) · gates 5/5
## CP6 Sentimento     [ ] sha= · shot= · hook=useRealSentimentData · gates 5/5
## CP7 Relatórios     [ ] sha= · shot= · CRUD ok: criar/editar/excluir · gates 5/5
## CP8 Entrega        [ ] PR= · CI= · merge= · prod=abas-09-prod-*.png
