# Achados 4: Dashboard (SLA, Sentimento, IA, War Room, Relatórios), doc 16, 2ª passada (13/10/2026)

Método: V3 `origin/main` (`src/components/dashboard/`, hooks) contra V2 `.integrador`. Somente leitura. Banco real NÃO verificado (só migrations). Cartões conferidos em `paridade-*/gerar.py` e `cards_*.py`.

## 1. Tabela comparativa

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|
| SLA dashboard (`SLAMetricsDashboard`) | MELHOR_NA_V2 (visual, sparklines, tendência) com 2 defeitos | `SLAMetricsDashboard.tsx` + `useSLAMetrics` chama RPC `rpc_sla_dashboard` no servidor (fuso do servidor) | `dashboard/SLAMetricsDashboard.tsx` + `hooks/sla/useSLAMetrics.ts`: lê `conversation_sla` paginado e agrega no cliente (denominador único, pendente fora da taxa). `rpc_sla_dashboard` não existe nas migrations V2. Erro: só `loading`, `data ?? 100` (`SLAMetricsDashboard.tsx:41`) | PB-45/PB-44 (b1b2 gerar.py: "?? 100", erro visível, `hasSample`) |
| SLA de Resolução na tela | DECISAO (fora de escopo) | coluna "Resolução" por agente | removido na V2 | n/a |
| Lazy `SLAConfigurationManager` sem ErrorBoundary (A15) | EQUIVALENTE | `SLAMetricsDashboard.tsx:2,153` | V2 usa `SLAConfigTable` direto e cada aba do `DashboardView` está em `SectionErrorBoundary` (`DashboardView.tsx:252-333`) | n/a |
| Relatórios agendados (widget do Dashboard) | LACUNA (V2 repete o fio quebrado que a V3 consertou) | `useScheduledReports.ts` grava em `scheduled_reports` (comentário DASHBOARD-16); Edge lê `scheduled_reports` | `hooks/dashboard/useScheduledReportConfigs.ts` grava em `scheduled_report_configs`; `send-scheduled-report/index.ts:106,228` lê/atualiza `scheduled_reports`; só `reports/ScheduledReportsManager` (hook `chat/useScheduledReports`) usa a tabela certa. Nada lê `scheduled_report_configs` em `supabase/functions` | PD-21, PD-22, PD-23, PB-44, PE-103 (cobre) |
| Edge `send-scheduled-report` (autorização) | MELHOR_NA_V2 | exige service-role/cron | `x-cron-secret` em tempo constante OU RPC de papel; autoriza ANTES de parsear | n/a |
| HealthScoreCard (`fn_system_health_score`) | DECISAO | RPC SECURITY DEFINER com cache (WAL, backup, pipeline webhook, wpp2) | `SystemHealthCard` + `systemHealth.ts` calcula no cliente com 3 sinais (conexões, falhas 24h, fila presa); erro de coleta não vira nota. Comentário em `systemHealth.ts:1-5` assume a troca | n/a |
| RealtimeMetricsPanel (`useRealtimeDashboard`) | MELHOR_NA_V2 | painel de msgs/min com histórico | `NowPanel` + `hooks/analytics/useRealtimeDashboard` | n/a |
| SentimentAlertsDashboard + abas | EQUIVALENTE com defeitos | `useSentimentData` lê `audit_logs` direto | V2 usa RPC `dashboard_sentiment_alerts` (E39, corrige supervisor vendo 0) e média que ignora ausente (IA-023) | (defeitos abaixo) |
| Exportação de sentimento | DECISAO (proibida) | botão "Exportação Bloqueada" (A9/A10) | V2 mantém botão desabilitado; sem `onExport` | regra do dono |
| `SentimentTrendChart` (`useRealSentimentData`) | EQUIVALENTE com defeitos | `SentimentHelpers.tsx:useRealSentimentData` | V2 usa `classifySentiment` (melhor), mas sem paginação, fuso do navegador e totais estimados | PD-25 cobre só carregando/erro |
| `useSentimentAnalyses` | NÃO PORTADO, sem necessidade | hook de lista | V2 tem `useRecentSentimentAlerts` | n/a |
| AIQuickAccess (A7 rotas inexistentes) | LACUNA já com cartão | rotas inexistentes | `AIQuickAccess.tsx` | PD-20 |
| AIStatsWidget (`useAIStats`) | LACUNA já com cartão | leitura sem `range` | `hooks/analytics/useAIStats.ts:71,78` sem `range`; `previousAnalyses` ignora `error` | PJ-28, PF-10 (parcial) |
| DemandPrediction | LACUNA já com cartão | lê `evolution_messages` 7 dias, média por hora | idem sem paginar, fuso do navegador | PD-24, PD-25 |
| War Room (dados) | LACUNA já com cartão | `useWarRoomData` (agentes e filas) | V2 igual; `agent_stats` com zeros | PB-11, PB-12, PB-13, PF-01..03 |
| War Room (alertas) | LACUNA parcial | `useWarRoomAlerts` filtra tipos válidos, canal com sufixo aleatório | `hooks/business/useWarRoomAlerts.ts`: dedupe do monitor de SLA (melhor), mas ver P1-A e P1-B abaixo | PB-13 cobre só a tela; WR1 (V3 cartão) |
| AgentReassignmentPanel | EQUIVALENTE; V3 invalida caches, V2 não | `useAgentReassignment` invalida contatos e war room | `hooks/crm/useAgentReassignment.ts` sem invalidação | PF-09, PF-12, PE-62 (cobre) |
| CSATDashboard | EQUIVALENTE com defeitos | `useCSAT` `select('*')` | `hooks/business/useCSAT.ts:62-69` sem paginar; erro vira "0" | sem cartão (P2-C) |
| Acessibilidade dos gráficos | LACUNA | recharts sem alternativa | só `VolumeChart.tsx:103` tem `role="img"` + `aria-label`; sem nada em Sentimento, Demanda, AIStats, Satisfação, AgentPerformance, SLACharts | PF-06 cobre só uso de IA |
| ErrorBoundary em lazy | MELHOR_NA_V2 | A15 | `ViewRouter.tsx:43` `ErrorBoundaryView` com retry + Suspense; `SectionErrorBoundary` por aba | n/a |
| Controle de acesso | MELHOR_NA_V2 | tabs soltas | `AGENT_TAB_VALUES` (`DashboardView.tsx:90`) + `NavigationService.canAccess`; War Room/Sentimento/SLA só STAFF | n/a |

Achados A1..A16 do rodapé do doc 16 aplicáveis ao recorte: A7 (PD-20 cobre), A9/A10 (decisão do dono, ok), A15 (não existe na V2), A16 (acoplamento War Room com inbox: `AgentReassignmentPanel` ainda importado de `components/inbox/`, só higiene, P2). A1..A6, A8 são de outras telas e já tratados em PD-24/25.

## 2. Lacunas REAIS sem cartão

### P1-A. War Room: a tabela `warroom_alerts` saiu da publicação realtime e nunca voltou (som e push mortos)
- Evidência: `supabase/migrations/20260317212204_...sql:86` faz `ADD TABLE public.warroom_alerts`; `20260401002035_f77017b8-...sql:4` faz `DROP TABLE public.warroom_alerts` da publicação `supabase_realtime`; nenhuma migration posterior a re-adiciona (`grep supabase_realtime ... warroom` só retorna esses dois).
- Efeito: o `INSERT` assinado em `useWarRoomAlerts.ts:128-157` nunca dispara. Som, push e dupla batida só acontecem pelo polling de 30 s da lista (que NÃO toca som). Os cartões PJ-17/RA1/PF-01 dizem "som e push existentes continuam disparando": premissa a confirmar.
- Implementar: (1) conferir `pg_publication_tables` no banco; (2) migration `ALTER PUBLICATION supabase_realtime ADD TABLE public.warroom_alerts` (e REPLICA IDENTITY se preciso), com RLS de SELECT só admin/supervisor (policy "Admins can view warroom alerts" já existe); (3) teste de contrato (migration contém o ADD); (4) enquanto isso, tocar som/push também quando o polling trouxer alerta novo (comparar ids anteriores).
- Perfil: workersql (publicação) + hugo (fallback no hook). Arquivos: `supabase/migrations/<ts>_warroom_alerts_realtime.sql`, `src/hooks/business/useWarRoomAlerts.ts`.

### P1-B. Alertas só tocam com a War Room aberta; monitor de SLA só roda com a tela aberta
- Evidência: `useWarRoomAlerts` só é chamado em `WarRoomDashboard.tsx:43` (grep em `src`: nenhum outro consumidor). O `checkSLABreaches` (`useWarRoomAlerts.ts:164-206`) cria o alerta `critical` do SLA a partir do navegador, e usa `first_response_breached = true` em TODO o histórico (não o ciclo atual); com a tela fechada nunca gera nem toca alerta.
- Na V3 o escopo é o mesmo no hook, mas há avisos globais em GL5 (falha de envio, webhook). Para `warroom_alerts` (conexão, rate limit, SLA) não há ouvinte global na V2.
- Implementar: (1) job no banco (pg_cron) ou Edge que cria o alerta de SLA do ciclo atual com `dedupe_key` (PF-01 define `crisis_room_snapshot`; reutilizar); remover o monitor do navegador; (2) ouvinte global leve (staff) de `INSERT` em `warroom_alerts` com toast + som respeitando silêncio/mudo, montado no layout; (3) testes.
- Perfil: workersql/edgar (job) + hugo (ouvinte). Arquivos: `useWarRoomAlerts.ts`, `src/components/layout/*` (ponto de montagem), nova migration.
- Verificar antes: PF-02/PF-03 e GL5 para não duplicar.

### P1-C. Página de Sentimento (`useSentimentData`): erro vira zeros, sem paginação, classificação diferente dos outros painéis
- Evidência: `src/components/dashboard/useSentimentData.ts:73-76` (`catch` só faz `log.error`; `setAlerts/setAnalyses` ficam vazios; a tela mostra "0 alertas", "0% negativos", "—") e `:66-70` lê `conversation_analyses` por 90 dias sem `range` (corte em 1000 sem aviso; a RLS é por visibilidade do contato, `20260930140000_align_ai_read_policies...:30`). Além disso `:107-112` e `:143-147` comparam `a.sentiment === 'negativo' | 'positivo' | 'neutro'` literal, enquanto `useAIStats.ts` e `useRealSentimentData` usam `classifySentiment` (inclui `critico` no negativo e legado EN). Resultado: o mesmo período mostra taxas de negativos diferentes entre a aba Sentimento, a aba IA e o gráfico de tendência. `getSentimentLabel` devolve o texto cru para `critico`.
- PD-25 cobre estados de erro do `SentimentTrendChart`, não esta página; PJ-28 cobre `useAIStats`.
- Implementar: expor `isError/error` (usar React Query ou `error` no estado) e mostrar bloco "Não foi possível carregar" com "Tentar de novo"; paginar com `fetchAllRows` (como `useSLAMetrics`) ou usar a RPC do PJ-28 ampliada; trocar os literais por `classifySentiment`; mapear `critico` em `getSentimentLabel/Color`; teste com 1500 linhas, `critico` e erro.
- Perfil: hugo. Arquivos: `src/components/dashboard/useSentimentData.ts`, `SentimentTabContent.tsx`, `SentimentAlertsDashboard.tsx`, testes.

### P1-D. Tendência de sentimento: números estimados e rótulos errados
- Evidência: `SentimentTrendChart.tsx` "N de M conversas" usa `totalAnalyses = soma de departments.total` de `useRecentSentimentAlerts` (`.limit(400)`, `useRecentSentimentAlerts.ts:51`), e `N = totalAnalyses * avgPositive / 100` onde `avgPositive` é a média SEM PESO dos percentuais diários. O comentário diz "não é estimativa", mas é. Os cartões de insight dizem "vs. período anterior" para a comparação entre METADES do mesmo período (`stats.half`). `useRealSentimentData` (`SentimentHelpers.tsx:22-62`) usa `subDays(new Date())` e `format` no fuso do navegador (a página de Sentimento usa `appDayKey`, fuso do app): o mesmo dia cai em baldes diferentes. Erro e vazio retornam `null` (indistinguível).
- Implementar: contar totais e baldes por soma real (ponderar por total do dia), sem `.limit(400)`; rotular "2ª metade vs 1ª metade"; trocar `subDays/format` por `appDay*`; devolver `{data,isError}`. Reaproveitar a RPC do PJ-28.
- Perfil: hugo (+ workersql se usar RPC). Arquivos: `SentimentHelpers.tsx`, `SentimentTrendChart.tsx`, `overview/SentimentTrendCard.tsx`, `hooks/analytics/useRecentSentimentAlerts.ts`.

### P2-A. Acessibilidade dos gráficos do Dashboard
- Evidência: contagem de `role="img"`/`aria-label` nos arquivos com `ResponsiveContainer`: só `overview/VolumeChart.tsx` tem. Sem texto alternativo em `SentimentTrendChart`, `SentimentTrendCard`, `DemandPrediction`, `AIStatsWidget`, `SatisfactionMetrics`, `AgentPerformancePanel`, `sla/SLACharts`, `queues/QueueCharts`.
- Implementar: componente `ChartA11y` (wrapper `role="img"` + `aria-label` resumo calculado + tabela `sr-only` com os pontos), usado nos gráficos acima; padrão do `VolumeChart`.
- Perfil: iris. Arquivos: `src/components/ui/` (novo wrapper) e os 8 componentes. Teste jest-axe.

### P2-B. War Room: acessibilidade e movimento
- Evidência: `WarRoomAlertRow.tsx:35` botão de dispensar só com ícone, sem `aria-label`; botões de som, atualização e tela cheia (`WarRoomDashboard.tsx:84-86`) só com Tooltip, sem `aria-label`; lista de alertas sem `role="log"`/`aria-live` (PF-03 cobre a Sala de Crise, não a War Room); `animate-pulse-subtle` (`WarRoomDashboard.tsx:74`) sem `motion-safe:`; `isFullscreen` não acompanha a tecla Esc (usar evento `fullscreenchange`); `dismissAlert` ignora `error` (`useWarRoomAlerts.ts:160-163`); dupla batida crítica chama `playAlertSound()` duas vezes seguidas (a segunda reinicia o som: vira uma só batida, `:135-139`).
- Implementar: corrigir tudo acima; atraso de 250 ms ou segundo áudio para a dupla batida; toast em falha ao dispensar.
- Perfil: iris (tela) + hugo (hook). Teste de a11y e do hook.

### P2-C. CSATDashboard: erro vira "0 avaliações" e leitura sem paginar
- Evidência: `components/csat/CSATDashboard.tsx:20-33` usa só `isLoading`; `hooks/business/useCSAT.ts:62-69` faz `select('*')` (traz texto de feedback) sem `range`; `stats` é calculada sobre no máximo 1000 linhas; `trend: 0` fixo (`:91`, não exibido, mas existe no tipo).
- Implementar: `isError` com "Tentar de novo"; paginar ou RPC `csat_summary(period)` com média, distribuição, % >= 4 e total; selecionar só `rating, created_at`; remover `trend` falso do tipo.
- Perfil: hugo + iris. Arquivos: `hooks/business/useCSAT.ts`, `components/csat/CSATDashboard.tsx`.

### P2-D. SLA no Dashboard: leitura inteira da tabela a cada 60 s no cliente
- Evidência: `hooks/sla/useSLAMetrics.ts:92-130` pagina TODO `conversation_sla` (período "Todos" sem limite inferior, `select('*, contacts!inner(assigned_to)')`) e `profiles` completo, com `refetchInterval: 60_000`. A V3 usava `rpc_sla_dashboard` no servidor. Melhor: RPC `sla_dashboard(p_period)` com a mesma regra do `tallyFirstResponse` (staff-only), `refetchInterval` só com aba visível (`useVisiblePolling`).
- Perfil: workersql + hugo. Verificar PB-45 antes de abrir (pode cobrir "denominador único" mas não o desempenho).

### P2-E. Higiene
- `AgentReassignmentPanel` mora em `components/inbox/` mas só o War Room usa (A16): mover para `dashboard/war-room/`.
- `hooks/dashboard/useScheduledReportConfigs` e `hooks/chat/useScheduledReports` coexistem (PD-21 manda unificar).
- `useAIStats.ts:78`: consulta do período anterior ignora `error` (a tendência vira "estável"/100%); somar ao PJ-28.

## 3. O que NÃO consegui verificar
- Banco real: se `warroom_alerts` está hoje em `pg_publication_tables` (P1-A), se `scheduled_report_configs` tem linhas criadas pela UI e se `cron.job` chama `send-scheduled-report` (PE-102/103), e as policies finais de `warroom_alerts` e `conversation_analyses`.
- Volume de `conversation_analyses`, `conversation_sla` e `csat_surveys` (para dizer se o corte de 1000 já morde).
- Runtime: se o som toca depois do polling (P1-A), comportamento do realtime com canal de nome fixo `warroom-alerts-realtime` (o `useWarRoomAlerts` só é montado uma vez, então sem colisão hoje).
- Checar cartões irmãos (PB-44/45, PD-21..25, PE-62, PF-01..03, PF-12) `done` ainda não integrados: a cópia lida é `.integrador`.

## 4. Contagens
- Itens comparados: 22. EQUIVALENTE/MELHOR_NA_V2/DECISAO: 11. LACUNAS já cobertas por cartão: 8. Lacunas novas: P1 = 4 (A, B, C, D), P2 = 5 (A..E).
