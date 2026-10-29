# Achados 3: Dashboard (Visão Geral, KPIs, mapas, metas, gamificação), V3 -> V2 (13/10/2026)

Somente leitura. V3 = origin/main de ~/projetos/Zapp_Web_V3 (src/components/dashboard, src/hooks, src/features/dashboard). V2 = ~/hermes-workspaces/Zapp_Web_V2/.integrador. Banco real NÃO verificado (só migrations).
Leitos de cartões: PD-20..29 (paridade-docs), PB-16..23 e achados_dashboard.md DB-1..DB-11 (paridade-b1b2), PE-36/37/51 (paridade-resto), PJ-36/40 (admin3). A área já foi muito auditada: a V2 está à frente da V3 em quase tudo. Abaixo, só o que ainda NÃO tem cartão.

## 1. Tabela (item | classificação | evidência V3 | evidência V2 | cartão)

| Item | Classe | V3 | V2 | Cartão |
|---|---|---|---|---|
| Visão Geral (KPIs hoje/ontem, volume, "Agora", filas, atividade, CSAT, sentimento) | MELHOR_NA_V2 | DashboardView.tsx (RealtimeMetricsPanel/HealthScoreCard/ProgressiveDisclosure, `useDashboardDataBatch`) | overview/* + RPCs `dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume` (SP, p_agent travado no servidor), erro com "Tentar de novo" (DashboardView.tsx:128-142) | - |
| Abas por papel (agente só Visão Geral/Metas/Satisfação) | MELHOR_NA_V2 | 9 abas para todos | DashboardView.tsx:78-80, `goToTab` bloqueia navegação cruzada | - |
| Filtros na URL, fuso do app | MELHOR_NA_V2 | DashboardFilters.tsx (hora do navegador) | useDashboardUrlFilters.ts + appDay* | PD-27 só falta "limpar/contador" |
| Limpar filtros + contador; validação das metas | LACUNA | DashboardFilters.tsx (selo "N filtros") | falta | PD-27 |
| DailyMetricsKpis (view `evolution_daily_metrics`) | LACUNA (view não existe no banco, DB-6) | DailyMetricsKpis.tsx + features/dashboard/hooks/useDailyMetricsKpis.ts | nenhuma série de 7 dias | PB-20/21/22 |
| ActivityHeatmap / ConversationHeatmap / DemandPrediction | LACUNA de qualidade (V2 herdou os defeitos) | leitura crua de `messages`, getDay()/getHours() do navegador, abas Resposta/Satisfação = contagem, "10h-16h"/"Terça" fixos | idêntico (ConversationHeatmap.tsx:71,284-290; useDemandPrediction.ts:43-60) | PD-24, PD-25 (+ itens 8 e 9 abaixo) |
| Metas: seletor Hoje/Semana/Mês, contagem sem corte de 1.000, `.single()` | LACUNA | GoalsDashboard.tsx:83-95 | GoalsDashboard.tsx sem period; DailyGoalsCard força 'today' | PB-16, PB-17 |
| Meta "Taxa de Resolução" | LACUNA (fonte errada, NOVO) | V3 só mostra 2 metas (messages, contacts); `resolution_rate` só em GoalsConfigDialog/DEFAULT_GOALS | useGoalsDashboard.ts:149-153 usa `conversation_analyses.status='resolvido'`; useGoalNotifications.ts:153-166 igual | NENHUM (item L1) |
| Config de metas (`useGoalsConfig`/`useSaveGoals`) | EQUIVALENTE | useGoalsConfig.ts upsert `profile_id,goal_type` | GoalsConfigDialog.tsx (update/insert por linha) | PD-27, PB-16 (`single`) |
| Notificação de meta duplica | LACUNA | - | useGoalNotifications.ts:28,195 | PB-? DB-3 (ver achados_dashboard.md; confirmar id em ids.json) |
| Gamificação: XP/coins/streak hardcoded (A3) | MELHOR_NA_V2 | removido na V3 (Etapa 66) | GoalsRail.tsx LevelCard e GamificationSection usam `useAgentGamification` real | - |
| RPCs de XP chamáveis pelo cliente | LACUNA P1 integridade | - | add_agent_xp ≤500/chamada sem teto, grant_agent_achievement | PB-18, PB-19 |
| DemoAchievements (botões sem efeito) e setas falsas do ranking | LACUNA | - | DashboardWidgetRenderer.tsx:145 | PB-23 |
| Toast/celebração de conquista ao vivo | LACUNA | GamificationProvider montado | provider morto | PE-36, PE-37 |
| ChallengesWidget "Desafios do Dia" com dado inventado | LACUNA (NOVO) | DashboardWidgetRenderer.tsx (`AnimatedBadge value="2/4"`, `: 45`, XP fixo) | mesmos números em DashboardWidgetRenderer.tsx:157-177 e fallback em DailyGoalsCard.tsx:24-31 | NENHUM (item L3) |
| AgentPerformancePanel (`useAgentPerformanceRanking`) | MELHOR_NA_V2 no layout; LACUNA no dado (NOVO) | typo `messagessSent` (A6), XP calculado no cliente | usa `dashboard_leaderboard` por período; KPIs do topo calculados sobre top-10 e CSAT na escala errada | NENHUM (item L2) |
| SatisfactionMetrics (stub na V3) | MELHOR_NA_V2 | SatisfactionMetrics.tsx = "indisponível" | CSAT real paginado por keyset (useCSAT.ts:152-227) + NPS | PE-51 (NPS vazio) |
| NPS no painel de Satisfação | LACUNA (parcial) | - | useNPSSurveys.ts: `select('*')...limit(500)` all-time, período filtrado no cliente | PE-51 cobre "sem dados", NÃO cobre o corte (item L5) |
| Relatórios agendados (aba Relatórios) | LACUNA | ScheduledReportsManager.tsx | duas tabelas, Edge lê outra | PD-21, PD-22, PD-23 |
| AIQuickAccess leva a rota 404 (A7) | LACUNA | `/sentiment-alerts` | AIQuickAccess.tsx / aiFeatures.ts: confira se já corrigido | PD-20 |
| DashboardToolbar morto (A1) | V3: código morto | nunca renderizado fora do ProgressiveDisclosure | V2 renderiza e mente a hora (item L7) | NENHUM |
| FloatingParticles / MiniSparkline / GamificationEffects (A14 vars CSS) | EQUIVALENTE | - | tokens `xp/coins/streak/rank-gold` existem (tailwind.config + styles/tokens.css:162); FloatingParticles respeita `prefers-reduced-motion` (MELHOR) | - |
| DraggableWidgetContainer / WidgetConfigSheet / useDashboardWidgets | DECISAO | V3 nunca expôs a edição | órfãos na V2; widgets só em GamificationSection colapsada | DB-9 (registrado, sem cartão) |
| Janela de 1.000 linhas: SLA (useSLAMetrics) | MELHOR_NA_V2 | - | fetchAllRows paginado (useSLAMetrics.ts:73-95) | - |
| CSAT breakdown | MELHOR_NA_V2 | - | keyset (created_at,id) com teto de 50 páginas e erro explícito | - |
| Testes | ver L10 | useDashboardData.test, useDashboardWidgets.test, useGoalsDashboard.colors.test, DemandPrediction.test | V2 tem muito mais testes de Visão Geral; faltam os de Equipe/Satisfação/Metas (tela) | NENHUM |
| A1..A16 do rodapé do doc 16 (lado dashboard) | A1 morto (V3) / A3 resolvido / A4 mapa: V2 igual (PD-24) / A5 stub resolvido na V2 / A6 typo não existe na V2 / A7 PD-20 / A8 ActivityHeatmap `resolutions` cai em 'messages': V2 igual (item L8) / A14 tokens existem / A15, A16: fora do recorte | | | |

## 2. Lacunas REAIS sem cartão (priorizadas)

### P1

**L1. Meta "Taxa de Resolução" calculada com a fonte errada** (hugo; workersql opcional)
- Evidência V2: `src/hooks/analytics/useGoalsDashboard.ts:149-153` calcula `resolvedAnalyses / totalAnalyses` sobre `conversation_analyses` filtrado por `analyzed_by = profile.id` (resultado da análise por IA pedida pelo usuário, status `resolvido`). `useGoalNotifications.ts:153-166` repete o mesmo. Não é taxa de resolução de atendimento. Sem análises no período a taxa vale 0%, o que derruba `overallProgress` (média de 3 metas), infla "Em risco" (GoalsDashboard.tsx) e dispara o fallback de DailyGoalsCard.
- V3: a meta `resolution_rate` só existe na configuração (GoalsConfigDialog.tsx:46) e em DEFAULT_GOALS; a tela mostra 2 metas, então o defeito é da V2.
- Implementar: calcular a taxa pelas conversas reais do agente no período (resolvidas em `conversation_closures` sobre atribuídas/encerradas), de preferência por RPC única `goals_progress(p_period)` no fuso America/Sao_Paulo que devolve mensagens enviadas, contatos novos e taxa (junta com PB-16: count no banco). Sem amostra, mostrar "—" e não 0%, e excluir a meta do `overallProgress`. Corrigir também `useGoalNotifications`.
- Arquivos: src/hooks/analytics/useGoalsDashboard.ts, src/hooks/analytics/useGoalNotifications.ts, supabase/migrations/<ts>_goals_progress_rpc.sql, testes (já existe useGoalsDashboard.test.tsx).
- Ligar a PB-16 (pais).

**L2. Aba Equipe: KPIs do topo calculados sobre o top-10 e "Satisfação" na escala errada** (hugo + iris; workersql para totais)
- Evidência V2: `src/hooks/gamification/useLeaderboard.ts` chama `dashboard_leaderboard(p_period, p_limit: 10)`; `AgentPerformancePanel.tsx:77-81` calcula "Agentes online x/N", "Conversas resolvidas" (soma), "Tempo médio" e "Satisfação média" sobre esses 10 (com 12+ atendentes, os totais ficam parciais e o ranking some com os demais). A RPC (migration 20260926112500, linha 89) devolve `satisfaction = coalesce(round(csat_percent)::int, 0)` (0 a 100, 0 quando não há avaliação). O painel faz `/100` e escreve "/5" (AgentPerformancePanel.tsx:80,206): CSAT 85% aparece como "0.9/5"; agentes sem avaliação entram como 0 e puxam a média para baixo; `avgResponseTime` também entra como 0 sem amostra.
- Implementar: (a) totais do topo vindos de uma RPC agregada (ou `p_limit` alto para a aba Equipe) e média só de quem tem amostra; (b) mostrar CSAT em % (mesma unidade de CsatCard/Satisfação) ou converter explicitamente, com "—" quando não há avaliação; (c) a RPC deve devolver NULL (não 0) para tempo de resposta e CSAT sem amostra (migration aditiva, fuso SP, guarda `is_admin_or_supervisor` mantida); (d) testes de escala e de vazio.
- Arquivos: src/components/dashboard/AgentPerformancePanel.tsx, src/components/dashboard/overview/TeamHighlightCard.tsx (confira a mesma escala), src/hooks/gamification/useLeaderboard.ts, supabase/migrations/<ts>_leaderboard_null_sem_amostra.sql, testes novos (não existe AgentPerformancePanel.test).
- Relacionado, não duplicado: PJ-36/PJ-40 mexem no XP do período da mesma RPC (coordenar a migration para não colidir).

**L3. "Desafios do Dia" com número inventado (V2 herdou da V3)** (iris; hugo se virar dado real)
- Evidência V2: `src/components/dashboard/DashboardWidgetRenderer.tsx:157-159` "Responder 10 mensagens" usa `stats.totalConversations`; "Tempo médio < 3min" mostra progresso fixo `45` quando falha; `:177` `<AnimatedBadge value="2/4" />` é texto fixo; cada desafio exibe "+50/100/75/150 XP" que nada concede (o servidor só credita marcos; ver PE-36). O fallback de DailyGoalsCard (`DailyGoalsCard.tsx:24-31`, "Desafios do Dia" quando não há metas) repete os mesmos quatro desafios. É dado falso numa tela de gestão.
- Implementar: contador "x/y" calculado dos próprios desafios, remover os "+N XP" e o `45` fixo (ou ligar a desafios reais configuráveis), trocar a base de "mensagens" por contagem real de mensagens enviadas do agente (reaproveitar L1/PB-16) e rotular o que for aproximação. Ou esconder o widget até existir fonte.
- Arquivos: src/components/dashboard/DashboardWidgetRenderer.tsx, src/components/dashboard/overview/DailyGoalsCard.tsx, testes (DailyGoalsCard.test.tsx existe).

### P2

**L4. Mistura de fuso entre telas do Dashboard** (hugo)
- A Visão Geral usa o fuso do APP (`appDay*`, RPCs com America/Sao_Paulo; R2-MOD-075), mas Metas, SLA, tempo real e CSAT usam o fuso do dispositivo: `useGoalsDashboard.ts:30-37` (`startOfDay/startOfWeek/startOfMonth`, semana `ptBR`=domingo, enquanto SLA usa `weekStartsOn:1`), `useGoalNotifications.ts:65-67`, `useSLAMetrics.ts:61-63`, `useSLAHistory.ts:76`, `useRealtimeDashboard.ts:100` (`todayStart.setHours(0,0,0,0)`), `useCSAT.ts:236-241` (janela e `format(created_at,'yyyy-MM-dd')`). Um supervisor em outro fuso vê "hoje" diferente entre abas; semana começa domingo em Metas e segunda em SLA.
- Implementar: usar `appDayStart/appWeekStart/appMonthStart/appDayKey` (src/lib/localDay.ts) nesses 6 pontos, padronizar a semana (segunda) e testes de fuso nos moldes de `useTodayHourlyVolume.apptz.test.ts`. Pode virar a mesma RPC do L1 para Metas. Obs.: o cabeçalho de localDay.ts ainda diz "fuso local do navegador" (regra de 30/09), contradito por R2-MOD-075; alinhar o texto.
- Arquivos listados acima + src/lib/localDay.ts (comentário).

**L5. NPS do painel de Satisfação lê 500 linhas all-time e filtra no cliente** (hugo/workersql, aguarda decisão do PE-51)
- `src/hooks/business/useNPSSurveys.ts` (select `*`, `.order(created_at desc).limit(500)`) e `SatisfactionMetrics.tsx:~58-66` filtra por período no cliente: com mais de 500 respostas o NPS de 30/90 dias perde as mais antigas da janela, e `select('*')` traz `feedback` (texto livre) de todo cliente a todo usuário que abra a aba (RLS não verificada). Hoje a tabela não recebe dados (PE-51), então é risco latente.
- Implementar (só se o NPS for construído): RPC `nps_summary(p_days)` com contagem de promotores/neutros/detratores no banco, sem texto livre, e hook sobre ela. Se o PE-51 mantiver "não construir NPS agora", registrar este item no corpo do PE-51.

**L6. Filtros de período/fila/agente só valem na Visão Geral, mas a barra aparece em todas as abas** (iris)
- `DashboardView.tsx:128-160` mostra `DashboardFilters` acima de todas as abas; Analytics (mapas/previsão), Metas, SLA, Equipe, Satisfação, Sentimento e Relatórios ignoram `filters` (ConversationHeatmap/ActivityHeatmap/SLAMetricsDashboard não recebem props). O aviso existente (`dash-kpis-period-notice`) só cobre os KPIs. O usuário acha que filtrou o mapa de calor.
- Implementar: esconder ou desabilitar a barra nas abas que não a usam, ou propagar queue/agent às RPCs dos mapas (PD-24) e SLA; no mínimo uma linha "Estes filtros valem para a Visão Geral". Teste de que a barra some/aviso aparece por aba.
- Arquivos: src/components/dashboard/DashboardView.tsx, overview/DashboardHeader.tsx.

**L7. DashboardToolbar mostra "Atualizado HH:mm" falso** (iris)
- `ProgressiveDisclosureDashboard.tsx:48` passa `lastUpdated={new Date()}` (hora de cada render) e `GamificationSection` não passa `onRefresh`, então o texto parece "Atualizado agora" sem nenhum refresh. A V3 tinha o mesmo (código morto lá; ativo na V2).
- Implementar: usar `dataUpdatedAt` do hook ou remover a barra dentro da seção; testes.
- Arquivos: src/components/dashboard/ProgressiveDisclosureDashboard.tsx, DashboardToolbar.tsx.

**L8. ActivityHeatmap: streak e níveis (complemento do PD-24/25)** (iris)
- `ActivityHeatmap.tsx` (V3 e V2 iguais): "Streak" conta de hoje para trás e zera se hoje ainda não teve mensagem, mesmo com ontem ativo; níveis fixos (>20, >50, >80) não se adaptam ao volume da operação; `metric` 'conversations'/'resolutions' é ignorado (A8, sempre conta `messages`); `Math.max(...[])` com dados vazios. Incluir no PD-24/25 ou abrir cartão pequeno: streak tolera hoje vazio, níveis por quartis do período, remover a prop `metric` morta, vazio sem Infinity.

**L9. Acessibilidade dos mapas de calor** (iris)
- Células são `motion.div` só com mouse (`ConversationHeatmap.tsx:228-242`, ActivityHeatmap idem): sem foco, sem `aria-label`, valor só em tooltip e cor como única codificação. Há apenas `role="region" tabIndex=0` no contêiner. Implementar: grade com `role="grid"`/células focáveis com `aria-label` ("Terça 14:00, 37 mensagens"), ou tabela de apoio recolhível; testes com axe (padrão `*.a11y.test.tsx` já usado).

**L10. Cobertura de testes das telas de Equipe, Satisfação e Metas** (workertestes)
- V2 não tem teste de: `AgentPerformancePanel`, `SatisfactionMetrics`, `GoalsDashboard` (tela), `GoalsRail`/`GoalsTable`, `SLAMetricsDashboard`, `useSatisfactionBreakdown` (keyset + tendência, `useCSAT.ts:152-227`), `useNPSSurveys`, `DemandPrediction`/`useDemandPrediction` (a V3 tem DemandPrediction.test.tsx). Escrever após L1/L2/PD-24 para não reescrever duas vezes.

### Sugestões de robustez/UX (sem cartão ainda, avaliar)
- Gamificação: `useLeaderboard.previousRank = rank` (DB-10/PB-23 cobre).
- Uma única fonte para "mensagens enviadas hoje" entre Metas, Gamificação e KPIs (hoje cada hook conta de um jeito).
- Observabilidade: log de falha da RPC `dashboard_leaderboard`/`dashboard_kpi` com contexto sem dado pessoal (hoje os cards mostram "—").

## 3. O que NÃO consegui verificar
- Banco real: se `dashboard_leaderboard` devolve mesmo 0 para sem amostra (só li a migration 20260926112500 e a reconciliação 20261003272707 não foi comparada linha a linha); quantos atendentes ativos existem (>10 torna L2 visível); se `conversation_analyses` tem linhas com `analyzed_by` e `status='resolvido'`; RLS de `nps_surveys` (L5); se `agent_stats`/`agent_achievements` têm EXECUTE de authenticated hoje (PB-18 diz que sim em 12/10).
- Runtime: aparência real de L3/L6/L7 (confirmar em captura); se a branch do dia já mudou `DashboardWidgetRenderer.tsx`/`useGoalsDashboard.ts` (a cópia lida é `.integrador`, pode haver cartões `done` ainda não integrados; checar cartões irmãos PB-16/17/23, PD-24/25/27 antes de abrir os novos).
- Não rodei `buscar_corpo.py` (só cobre 122 cartões e requer o kanban.db); a checagem de cartões existentes foi por grep nos `gerar.py`/`cards_*.py` de paridade-*.
