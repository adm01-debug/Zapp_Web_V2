# Paridade doc 16 (connections + dashboard), recorte 5: inventário, testes, rotas, achados A1..A16, docs, a11y

Auditoria SOMENTE LEITURA, 13/10/2026. V3 = `origin/main`; V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador` (HEAD 96dd72dc5f). Banco real: não verificado.

## (a) Inventário real da V3 x doc 16

V3 hoje: connections = 33 arquivos (30 fontes + 3 testes), dashboard = 32 arquivos (31 fontes + 1 teste) = 65 no total.
Fora do doc 16 (o doc cita 65 mas lista só os fontes): apenas os 3 testes novos: `connections/__tests__/AddConnectionDialog.test.tsx`, `connections/__tests__/ConnectionCardMenu.test.tsx`, `dashboard/__tests__/DemandPrediction.test.tsx`. Todos os 62 fontes estão no doc. Ou seja, o doc está completo em fontes; erra no estado (ver A1..A16 e abaixo).

Correções ao doc (código real V3): `ConnectionsView` da V3 renderiza AddConnectionDialog (l.233), IdempotencyMissBanner (l.494), DegradedQuickActions (l.572), QrCountdown/QrTtlBadge/RefreshQrButton/QrAttemptHistory (l.396-485) e IntegrationsPanel (l.651), e tem filtro por status e busca (l.498-513). Logo `AddConnectionDialog` NÃO é órfão (A2 do doc é falso). `ConnectionsStats` esse sim não é renderizado (só teste). O doc também diz que `connections` aponta para `ConnectionsIntegrationsHub` (ViewRouter V3 l.84 e l.98, também `integrations`).

### Mapa de arquivos connections/ (V3 -> V2)

| Arquivo V3 | O que faz | Par na V2 | Classe |
|---|---|---|---|
| AddConnectionDialog | criar conexão (nome, telefone mascarado, api_type evolution/official, erro inline role=alert) | diálogo inline em `ConnectionsView.tsx:84-104` (só nome + telefone, sem máscara/validação/erro inline), travado por `multi_connection_enabled` (E42, decisão) | PARCIAL (cartão UI-07 cobre máscara; ver L-C5) |
| BridgeSupabaseView + bridge/* | diagnóstico ponte Supabase-Evolution (useBridgeHealth) | `components/monitoring/EvolutionMonitoringDashboard` (view `evolution-monitor`, admin) + ADR-004 | DECISAO/EQUIVALENTE |
| BusinessHoursDialog / Indicator | horário por dia + mensagem de ausência | mesmo nome na V2 (263/129 linhas, teste aria-labels) | EQUIVALENTE |
| ConnectionAuditDialog | log de auditoria da instância | mesmo nome + teste | EQUIVALENTE (PB-06 audita trilha) |
| ConnectionCard | cartão (status, bateria, ações) | mesmo nome (208 linhas, menu inline) + testes confirmacao/sem-integracoes | EQUIVALENTE (PD-26 melhora) |
| ConnectionCardMenu | menu de ações (recheck, QR, fila, settings, integrações, histórico, excluir) | menu inline dentro do ConnectionCard; SEM "Reconectar" nem "Reverificar agora" | LACUNA parcial (L-C2) |
| ConnectionDisconnectDialog / ConnectionQueuesDialog | confirmar desconexão / vincular filas | mesmo nome (+ `ConnectionDeleteDialog` só V2) | EQUIVALENTE / MELHOR_NA_V2 (excluir com confirmação) |
| ConnectionsIntegrationsHub | abas Conexões / Integrações / Ponte | view `integrations` separada na V2 (menu Conexões) | DECISAO de layout |
| ConnectionsStats | 3 cartões com subtexto e plural (órfão na V3) | cartões inline em ConnectionsView sem subtexto | cartão PD-26 |
| ConnectionsView | tela principal | V2 `ConnectionsView` (210 linhas) | PARCIAL (faltam QR TTL/histórico, filtro, banner) |
| DegradedQuickActions | bloco para instância degradada: diagnóstico, QR, revalidar agora | nenhum | LACUNA (L-C2) |
| IdempotencyMissBanner | banner admin do cache de idempotência | nenhum no connections/; V2 tem painel de retry noutra tela | cartão paridade-admin3 (PJ, idempotência) cobre o alerta |
| InstanceSettingsDialog / TabContent | configurações da instância (privacidade, reconexão) | mesmo nome + testes privacidade/aria | EQUIVALENTE |
| IntegrationsPanel (+Fields/Parts) | 6 integrações WA por conexão | nenhum no connections/; teste `ConnectionCard.sem-integracoes` mostra que a V2 retirou de propósito | DECISAO (verificar) |
| NumberReputationMonitor | reputação do número | mesmo nome + teste | EQUIVALENTE |
| OfficialApiConfigDialog | credenciais Cloud API oficial (`whatsapp_official_credentials`) | nenhum; tabela não existe em migrations/types da V2 | DECISAO provável (API oficial), confirmar |
| QrCodeDialog / QrCountdown / QrTtlBadge / RefreshQrButton / QrAttemptHistory | QR com contagem regressiva, TTL detectado, anti-spam de refresh (cooldown 5 s + estabilização 400 ms), histórico das 5 últimas tentativas (`qr_attempts`) | QR inline em `ConnectionsView.tsx:107-148`: imagem + "Gerar novo código" sem cooldown/contagem/histórico | LACUNA (L-C1) |
| connectionCardHelpers.ts, types.ts, useConnectionCardActions.ts | helpers de status, reconectar (restart + 4 s + health-check + QR automático), reverificar | status inline no card; reconexão só em `alerts/EvolutionDisconnectBanner.tsx` (reconecta uma por vez, dispensável) e `hooks/connections/useConnectionsHealth.ts` | PARCIAL (L-C2) |

### Mapa de arquivos dashboard/ (V3 -> V2)

| Arquivo V3 | Par na V2 | Classe |
|---|---|---|
| AIQuickAccess, AIStatsWidget, aiFeatures | mesmos nomes (+ `overview/AIToolsCard`) e testes | EQUIVALENTE (rota 404, ver A7) |
| ActivityHeatmap, ConversationHeatmap | mesmos nomes + testes | PARCIAL (A4/A8 persistem; PD-24/25) |
| AgentPerformancePanel | mesmo nome | MELHOR_NA_V2 (campo `messagesHandled`, ordenação, top 3) |
| DailyMetricsKpis (view `evolution_daily_metrics`) | `overview/DashboardKpiRow` + `hooks/dashboard/useDashboardKpi`; view não existe na V2 | MELHOR_NA_V2 (DECISAO: KPIs novos) |
| DashboardFilters, DashboardSectionHeader, DashboardToolbar | mesmos nomes + testes a11y/fuso | MELHOR_NA_V2 (toolbar usada no Progressive; A1 não vale) |
| DashboardView, DashboardWidgetRenderer | mesmos nomes; V2 usa `overview/*` (Greeting, KpiRow, NowPanel, VolumeChart etc.) | MELHOR_NA_V2 |
| DemandPrediction | mesmo nome (sem teste na V2) | EQUIVALENTE, teste falta |
| FloatingParticles | mesmo nome; respeita reduced-motion | EQUIVALENTE |
| GamificationEffects, MiniSparkline | `GamificationEffects` + `metrics/MiniSparkline` + teste sparkline | EQUIVALENTE |
| GoalsConfigDialog, GoalsDashboard | mesmos + `goals/GoalsRail`, `GoalsTable` + testes | MELHOR_NA_V2 |
| HealthScoreCard (RPC `fn_system_health_score`) | `overview/SystemHealthCard` + `systemHealth.ts` + testes; RPC está em `migrations/20261007004545_secd_caller_check_13.sql` | EQUIVALENTE |
| ProgressiveDisclosureDashboard | mesmo nome | EQUIVALENTE |
| RealtimeMetricsPanel | hook `useRealtimeDashboard` (+3 testes), painel substituído por `NowPanel` | MELHOR_NA_V2 |
| SLAMetricsDashboard | mesmo nome + `dashboard/sla/*` (+ teste) | MELHOR_NA_V2 |
| SatisfactionMetrics | V2 liga em `useSatisfactionBreakdown` + `useNPSSurveys`; não é stub (A5 não vale) | MELHOR_NA_V2 |
| ScheduledReportsManager | mesmo nome + 2 testes (PD-21..23) | EQUIVALENTE |
| Sentiment* (4) | mesmos nomes + testes (a11y, vocabulário) | EQUIVALENTE |
| WarRoomDashboard + war-room/* | mesmos 5 arquivos | PARCIAL: sem loading/erro, sem aria-label nos 3 botões (L-D1) |

Arquivos que só existem na V2: `DraggableWidgetContainer`, `WidgetConfigSheet`, `MetricComponents`, `SatisfactionAgentRanking`, `dashboardFilterDefaults`, `systemHealth`, `useSentimentData`, `overview/*` (19), `goals/*`, `sla/*`, `metrics/*`, `connections/ConnectionDeleteDialog`.

## (b) Testes

### V3 nas duas pastas (4 arquivos)
- `AddConnectionDialog.test.tsx` (14 casos): trigger sempre visível; campos refletem estado; troca evolution->official; hint da API oficial; Cancelar/Adicionar; `isCreating` desabilita e mostra "Criando..."; alerta inline `role="alert"`; nome vazio -> toast + alerta; telefone inválido; falha de criação (toast destrutivo, diálogo aberto); sucesso fecha.
- `ConnectionCardMenu.test.tsx` (4): exclusão indisponível acessível por teclado, tooltip por hover, Enter/Space não disparam, tooltip reabre limpo.
- `ConnectionsStats.test.tsx` (13): singular/plural, zero conexões, online só `connected`, soma, cor de alerta.
- `DemandPrediction.test.tsx` (1): dados vazios tratados como estáveis sem consultar a fonte.

### V3 relacionados fora das pastas
e2e: `whatsapp-connection.spec.ts` (cria instância e exibe QR), `connection-to-inbox-inbound.spec.ts` (bolha inbound), `admin-evolution-api-smoke`, `dlq-idempotency`, `evolution-*retry-failure`. Unit: `useEvolutionAutoReconnect.exhaustion`, `evolutionAutoReconnectState`, `useIdempotencyMissAlerts.helpers`, `useHubTabNavigation`, `useGoalsDashboard.colors`, `WhatsAppConnectionStatus`, `useConnectionsActions/Realtime/State`, `evolutionCircuitBreaker`, `degradacao-evolution`, `evolutionDiagnostics`, `evolutionInstance`, `evolutionSendRetry.invoke`, `sla-route-contract`, `SLAConfigurationManager`, `useSLAMetrics`, `useWarRoomAlerts(.integration)`.

### V2 (muito mais testes)
connections: 8 arquivos (aria-labels x2, auditoria, confirmação de exclusão, sem-integrações, trava multi-conexão, privacidade, reputação); dashboard: 28 arquivos (a11y de Filters/Scheduled/Sentiment, fuso, erro por seção, KPIs, saúde, sla); hooks: War Room (3), DashboardData, Widgets, Realtime (3), Goals, useConnectionsManager (3), useConnectionsHealth.

### Comportamentos testados na V3 SEM teste equivalente na V2
1. Validação do formulário de nova conexão (nome vazio, telefone inválido, erro inline `role="alert"`, estado "Criando...", troca evolution/official): a V2 só testa a trava multi-conexão. Sem teste do diálogo (L-T1).
2. Subtexto/plural dos cartões de estatística de conexões (V2 sem teste; PD-26 cita).
3. DemandPrediction com dados vazios (V2 sem teste algum do componente).
4. Reconexão automática: exaustão de tentativas e máquina de estados (`useEvolutionAutoReconnect.exhaustion`, `evolutionAutoReconnectState`); a V2 só testa o banner (`EvolutionDisconnectBanner.janela-manutencao`).
5. Circuit breaker e degradação do cliente Evolution (`evolutionCircuitBreaker`, `degradacao-evolution`, `evolutionSendRetry`, `evolutionDiagnostics`, `evolutionInstance`): V2 só tem o teste do lado servidor (`evolution-api-proxy-circuit-breaker.test.ts`).
6. QR: nenhum teste de contagem/TTL/cooldown na V3 também (só e2e), mas a V3 tem o e2e "cria instância e exibe QR"; a V2 não tem NENHUM e2e de conexão/QR (`e2e/` sem whatsapp-connection nem connection-to-inbox).
7. `WhatsAppConnectionStatus` e `useConnectionsRealtime/Actions/State` (V2 cobre parte via `useConnectionsManager.*.test`).
8. `useHubTabNavigation` e `sla-route-contract` (rota SLA): V2 tem `SLADashboard.sidebar-navegacao.test` (equivalente).

## (c) Achados A1..A16 do doc contra a V2

| # | Defeito na V2? | Evidência V2 | Cartão |
|---|---|---|---|
| A1 DashboardToolbar morto | NÃO. É importado | `ProgressiveDisclosureDashboard.tsx:9,59` | n/a |
| A2 AddConnectionDialog órfão | NÃO se aplica (V3 usa de fato). V2 tem diálogo inline; criação travada de propósito | `ConnectionsView.tsx:30,84,48` (E42) | DECISAO (plano multi-conexão 25/09) |
| A3 XP/coins/streak 1250/89/7 | NÃO | grep `1250` em DashboardView/GamificationSection: 0 | n/a |
| A4 Heatmap response_time/satisfaction zerados | SIM | `ConversationHeatmap.tsx:45,162-165` mantém abas Resposta/Satisfação | PD-25 (t_2de7322c), PD-24 |
| A5 SatisfactionMetrics stub | NÃO | usa `useSatisfactionBreakdown`, `useNPSSurveys` (`SatisfactionMetrics.tsx:5-6`) | n/a |
| A6 typo `messagessSent` | NÃO | campo `messagesHandled` (`AgentPerformancePanel.tsx:70,165`) | n/a |
| A7 rotas inexistentes | SIM, pior: `/sentiment-alerts` (404 em `AppRoutes.tsx:159`) em `aiFeatures.ts:46,71` e `AIQuickAccess.tsx:175`. As outras (`/voice-changer`, `/ai-summary`) não existem mais | `aiFeatures.ts`, `AppRoutes.tsx` | PD-20 (t_76903c03) |
| A8 `resolutions` cai no branch errado | SIM (variante): `queryFn` ignora `metric` e conta sempre `messages`, mas o rótulo troca para "conversas"/"resoluções" (`ActivityHeatmap.tsx:56-75,149-153`); além disso busca sem limite (teto 1000 do PostgREST) | PD-24 cobre o corte; o rótulo falso cabe em PD-25 |
| A9 exportação bloqueada | SIM, igual; por regra do dono (nada exporta) vira DECISÃO: remover o botão "Exportação Bloqueada" em vez de deixá-lo desabilitado (`SentimentAlertsDashboard.tsx:21`) | sem cartão (L-D3, P2) |
| A10 `onExport` sem handler | NÃO existe `onExport` na V2 (grep 0) | n/a |
| A11 sleep fixo de 4 s | NÃO existe, porque a V2 não tem o fluxo reconectar+health-check no cartão. A V2 também NÃO tem o fluxo (lacuna L-C2) | ao implementar L-C2, usar polling com limite em vez de sleep |
| A12 toast duplo (sonner x use-toast) | SIM, pior: 3 arquivos em `sonner` (`InstanceSettingsDialog`, `NumberReputationMonitor`, `ConnectionQueuesDialog`) e 3 em `@/hooks/ui/use-toast` (`ConnectionCard`, `BusinessHoursDialog`, `ConnectionsView`) | sem cartão (L-C4, P2) |
| A13 view `_safe` fora dos tipos | N/A: `whatsapp_official_credentials(_safe)`, `qr_attempts`, `reconnection_logs`, `evolution_daily_metrics` têm 0 ocorrências em `types.ts` e em `supabase/migrations` da V2. Não verificável sem banco | conferir no banco real |
| A14 CSS vars --xp/--coins/--streak/--rank-gold | NÃO: definidas em `styles/tokens.css:162-171` (+ foregrounds, glows) e usadas em `components.css:71,151` | n/a |
| A15 lazy sem ErrorBoundary | NÃO: V2 não usa lazy dentro do SLAMetricsDashboard; `DashboardView` envolve cada seção em `SectionErrorBoundary` (l.185-267) e há teste `DashboardView.section-error` | n/a |
| A16 acoplamento war room x inbox | SIM, igual (`WarRoomDashboard.tsx:22` importa `@/components/inbox/AgentReassignmentPanel`). Impacto baixo (mesmo bundle da app); é só nota de arquitetura, sem cartão | n/a |

## (d) Rotas, lazyViews, menus e papéis

| Tela | V3 | V2 |
|---|---|---|
| Dashboard | `lazyViews`/`ViewRouter:78` `dashboard`, sem papel mínimo; sidebarNav `dashboard` | `ViewRouter.tsx:46`, `navigation.service.ts:65` (primário, sem restrição de papel), atalho Alt+R; gutter compacto |
| Conexões | `connections` e `integrations` -> `ConnectionsIntegrationsHub` (3 abas: Conexões, Integrações, Ponte). Sem papel mínimo (qualquer agente vê); `admin-connections` só admin | `connections` -> `ConnectionsView` e `integrations` separado; ambos `STAFF_ROLES` (admin, supervisor) em `navigation.service.ts:112-113` e bloqueio real em `ViewRouter` via `canAccess` (negação por padrão até carregar papéis). MELHOR_NA_V2 |
| War Room | `warroom` -> `WarRoomDashboard`; papel `supervisor` (hierárquico, admin/dev entram) | `warroom` -> `WarRoomDashboard`, `STAFF_ROLES` (`navigation.service.ts:102`). EQUIVALENTE |
| Sentimento | `sentiment` | `sentiment` STAFF (`:103`) |
| SLA | `sla`, `sla-history` | `/sla`, `/sla/history` em `AppRoutes.tsx:127,135` + view `sla` |
| Rota do React Router `/sentiment-alerts` | não existe na V3 também | não existe (A7) |
| Ponte Supabase-Evolution | aba do Hub; `sicoob-bridge` admin | `evolution-monitor` (admin) |
| Reputação do número | dentro da tela | dentro da tela |

Atalhos: V2 tem `useGlobalKeyboardShortcuts.dashboard.test` e `Index.keyboard-dashboard-view.test`; V3 não.

## (e) Docs/ADR/runbooks da V3 que a V2 deveria ter (nenhum existe na V2: confirmado por `git ls-files docs`)

| Doc V3 | Conteúdo | Vale para a V2? |
|---|---|---|
| `docs/audits/connection-creation-flow.md` | criação de conexão só faz INSERT; a instância Evolution nasce implicitamente no `connect` (404 -> auto-create); mapa do fluxo | SIM: a V2 tem a trava E42 e o plano multi-conexão, mas sem este mapa |
| `docs/audits/triggers-whatsapp-connections.md` | triggers da tabela `whatsapp_connections` | SIM (conferir triggers na V2) |
| `docs/RUNBOOK_401_WORKERS_EVOLUTION_20260806.md` | 401 na Evolution por chave antiga em edge functions; incidente wpp2 (mesma origem do comentário "UUID causa 404 e instância fantasma") | SIM, runbook de rotação de chave da Evolution |
| `docs/INCIDENTE-EVOLUTION-20260806.md`, `docs/BOUNDARY-evolution.md`, `docs/EVOLUTION_API_FMEA_2026-07-04.md` | incidente, fronteira Evolution/Zapp, FMEA | SIM (FMEA e fronteira) |
| `docs/RUNBOOK_WA_BUSINESS_ACTIVATION.md` | ativação da Cloud API oficial (wppmkt) | só se a API oficial for retomada (DECISAO) |
| `docs/runbooks/APPLY_ZAPP_EVOLUTION_BRIDGES.md` | aplicar views da ponte zapp.evolution_* | N/A se a V2 não usa ponte |
| `docs/adr/ADR-008-dashboard-sla-sem-dados.md` | SLA sem dados mostra "Sem dados", nunca 100% | SIM como regra; checar `SLAMetricsDashboard` e `dashboard/sla/slaRate.ts` da V2 |
| `docs/adr/ADR-006-arquitetura-sla-canonica.md` | arquitetura canônica do SLA | SIM |
| `docs/SLA-ESCALATION-CRON.md` | já existe na V2 | ok |
| `docs/INCIDENT-RUNBOOK.md`/`TROUBLESHOOTING.md` | já na V2 | ok |

Não há, em nenhuma das duas, documento de QR/reconexão nem de health score (só código e comentários).

## (f) Acessibilidade e responsividade

| Ponto | V3 | V2 | Veredito |
|---|---|---|---|
| `prefers-reduced-motion` FloatingParticles | respeita | respeita (pontos estáticos) | EQUIVALENTE |
| Confetti / AuroraBorealis | Aurora respeita; Confetti não referencia | nenhum dos dois referencia `reduced` (`effects/Confetti.tsx`, `AuroraBorealis.tsx`, `GamificationEffects.tsx`); só CSS global `accessibility.css:75` e `index.css:53` | LACUNA P2 (L-A1); a regra global pode cobrir animações CSS, não JS (canvas/framer) |
| `aria-*`/`role` (contagem em connections/ e dashboard/) | 23 / 9 | 14 / 32 | V2 melhor no dashboard, pior no connections (QR sem `aria-live`; V3 tem `aria-live` no QrCountdown) |
| War Room: botões de ícone (som, atualizar, tela cheia) | `aria-label` nos 3 (l.118,131,144) | 0 `aria-label`; só Tooltip | LACUNA P1 a11y (L-D1) |
| War Room: carregando/erro | n/d | nenhum (`useWarRoomData` lança erro, tela não mostra) | LACUNA (L-D1) |
| Skeleton | dashboard 8 arquivos, connections 0 | dashboard 5 arquivos + `OverviewSkeleton`; connections 0 (usa spinner) | V2 ok |
| Estado vazio | EmptyState em ConnectionsView | EmptyState com texto da trava | EQUIVALENTE |
| Teste a11y | nenhum | `DashboardFilters.a11y`, `ScheduledReportsManager.a11y`, `SentimentAlertsDashboard.a11y`, aria-labels de BusinessHours/InstanceSettings, e2e `a11y-contraste` | MELHOR_NA_V2 |
| Responsividade | PD-26 cobre card de conexão (360 px) | idem | cartão PD-26 |

## Lacunas REAIS sem cartão (priorizadas)

Nenhuma P0 (nada de segurança/dados/LGPD neste recorte além do que já tem cartão; a rota 404 e o heatmap já têm).

**P1**
- **L-C1. QR com contagem, TTL, anti-spam e histórico.** O QR da V2 (`ConnectionsView.tsx:107-148`) não mostra tempo restante, não impede cliques repetidos em "Gerar novo código" (a V3 usa cooldown de 5 s + estabilização de 400 ms e bloqueia durante geração em andamento) e não guarda tentativas. Implementar: extrair `QrCodeDialog` com contagem regressiva (`aria-live="polite"`, vermelho nos últimos 10 s), expiração clara ("QR Code expirado" + botão), `RefreshQrButton` com cooldown e motivo do bloqueio; histórico das últimas 5 tentativas só se existir tabela (`qr_attempts` não existe na V2: exigir migration com RLS por conexão/admin). Respeitar decisão "QR guardado no navegador" (NÃO usar sessionStorage como a V3 faz em QrCountdown). Perfil: iris (UI) + workersql (tabela/RLS) + hugo (hook). Arquivos: `src/components/connections/QrCodeDialog.tsx` (novo), `ConnectionsView.tsx`, `hooks/inbox/useConnectionsManager.ts`, migration nova.
- **L-C2. Reconectar e Reverificar no cartão + bloco "conexão degradada".** A V2 tem `health_status` visível (`ConnectionCard.tsx:110-123`) mas nenhum botão para reverificar (`connection-health-check` com `instanceName`) nem reconectar (restart + conferir estado + QR automático se ainda fechada). Só o banner global reconecta, e pode ser dispensado. Implementar `useConnectionCardActions` (usar `evolutionInstanceName`, nunca o UUID; esperar o estado com polling de até N s em vez de sleep fixo = A11) e `DegradedQuickActions` com latência (`health_response_ms` por faixa), links para Diagnóstico/QR. Perfil: hugo (hook) + iris (bloco). Arquivos: `components/connections/ConnectionCard.tsx`, novo `DegradedQuickActions.tsx`, novo `hooks/connections/useConnectionCardActions.ts`, teste.
- **L-T1. Testes que faltam.** (1) diálogo de nova conexão (nome vazio, telefone inválido, falha de criação mantém aberto, sucesso fecha, "Criando..."); (2) `ConnectionsStats`/cartões com plural e subtexto (junto de PD-26); (3) `DemandPrediction` com dado vazio ("Estável", sem consulta); (4) reconexão automática e exaustão (se L-C2 criar a máquina de estados); (5) e2e de conexão: abrir Conexões, ver cartão, abrir QR com resposta mockada, trava multi-conexão. A V2 não tem NENHUM e2e de conexão. Perfil: workertestes. Arquivos: `components/connections/__tests__/`, `components/dashboard/__tests__/DemandPrediction.test.tsx`, `e2e/conexoes.spec.ts`.
- **L-D1. War Room sem carregando/erro e sem rótulos de acessibilidade.** `WarRoomDashboard.tsx` não trata `isLoading`/erro de `useWarRoomData` (lista vazia parece "tudo calmo", perigoso numa tela de operação), botões de som/atualizar/tela cheia sem `aria-label` (a V3 tem), "Atualizado" usa `toLocaleTimeString()` sem fuso do app, e o `setInterval` de 30 s só muda o relógio (não refaz busca: confirmar em `useWarRoomData`). Implementar skeleton + erro com "Tentar de novo", `aria-label` e `aria-pressed`, região `aria-live` para alertas críticos novos, fuso do app. Perfil: iris (+hugo se refetch). Arquivos: `components/dashboard/WarRoomDashboard.tsx`, `war-room/*`, `hooks/business/useWarRoomData.ts`, teste.

**P2**
- **L-C4. Biblioteca de toast única em connections/.** 3 arquivos em `sonner` e 3 em `use-toast` (A12 vale na V2). Unificar no padrão da V2 e conferir no resto do app. Perfil: iris. Arquivos: `InstanceSettingsDialog`, `NumberReputationMonitor`, `ConnectionQueuesDialog`.
- **L-C5. Diálogo de nova conexão com validação.** Máscara e erro dentro do diálogo já estão em UI-07 (`paridade-ui/gerar_cartoes.py:86`); falta acrescentar `role="alert"` com mensagem inline, `isCreating` bloqueando os dois botões, e teste (L-T1). Só tem efeito quando `multi_connection_enabled` ligar; juntar ao cartão UI-07 se ainda aberto.
- **L-C6. Filtro por status e busca na lista de conexões** (V3 `ConnectionsView:498-513`). Só vale com várias conexões; hoje a trava multi-conexão deixa 1. Postergar para junto da multi-conexão. Perfil: iris.
- **L-A1. Respeito a `prefers-reduced-motion` nos efeitos JS** (Confetti, GamificationEffects, AuroraBorealis, transições do War Room): hoje só o CSS global cobre. Usar `useReducedMotion` do `ui/motion` e não disparar confete. Perfil: iris. Arquivos: `components/effects/Confetti.tsx`, `AuroraBorealis.tsx`, `dashboard/GamificationEffects.tsx`.
- **L-D3. Botão "Exportação Bloqueada" permanente** (`SentimentAlertsDashboard.tsx:21`): por regra do dono (nada exporta), remover o botão desabilitado em vez de exibir recurso proibido. Perfil: iris, trivial.
- **L-D4. Rótulo falso do mapa de atividade** (`ActivityHeatmap.tsx`): `metric` é ignorado na consulta (A8 na V2). Ou remover a prop `metric`, ou ligar conversas (`conversations`) e resoluções (`conversation_events`/status resolved) com agregação no servidor. Coordenar com PD-24/PD-25 (adicionar este ponto ao PD-25). Perfil: iris/hugo.
- **L-E1. Docs/runbooks de conexão para a V2** (worker): trazer e adaptar `connection-creation-flow.md`, `RUNBOOK_401_WORKERS_EVOLUTION`, `BOUNDARY-evolution`, `ADR-008` (SLA sem dados), e escrever um runbook curto de QR/reconexão/health score que não existe em nenhuma versão. Perfil: worker. Arquivos: `docs/runbooks/conexoes-qr-reconexao.md`, `docs/adr/`.

## Cobertura por cartão já existente (não duplicar)
PD-20 (rotas de IA 404), PD-21..23 (relatórios agendados), PD-24/25 (heatmaps/previsão/skeleton/erro), PD-26 (cartão de conexão, estatísticas, desconectando), PD-27 (filtros/metas), PD-28/29 (incidentes de pausa), UI-07 (máscara de telefone), PB-06 (trilha de auditoria de conexão), PB-07 (evolution-api timeout/validação), PD-38..40 (alertas de conexão por usuário), PJ-11 (diagnóstico não dispara health-check), PJ-17 (alerta de falha por conexão), PJ idempotência em `paridade-admin3/cards_admin3.py:132`.
Sem nenhum cartão (grep por QrCountdown, qr_attempts, RefreshQrButton, DegradedQuick, AutoReconnect, OfficialApiConfig, official_credentials, BridgeSupabase, HealthScoreCard, reconnection_logs, useConnectionCardActions, AddConnectionDialog): L-C1, L-C2, L-T1, L-D1, L-C4, L-A1, L-D3, L-E1.

## Melhorias que a V2 pode ganhar (respeitando as regras do dono)
- Em vez de um sleep fixo, reverificar com polling de até 30 s e botão "Cancelar" (evita A11).
- Tela de conexões com `aria-live` para mudanças de status (conectado/desconectado) e foco movido para o QR ao abrir.
- O banner de desconexão não deve poder esconder uma queda para sempre: conferir se `EvolutionDisconnectBanner` volta a aparecer quando muda o conjunto de instâncias caídas.
- Telemetria: registrar tentativas de QR (sucesso/expirou/erro) para saber a taxa de pareamento; tabela com RLS, sem dado sensível (não gravar o QR).

## O que NÃO consegui verificar
- Banco real: existência de `qr_attempts`, `reconnection_logs`, `whatsapp_official_credentials(_safe)`, `evolution_daily_metrics`, `scheduled_reports` (colunas), RPC `fn_system_health_score` e `is_within_business_hours` (a V2 tem `fn_system_health_score` em migration `20261007004545`; `is_within_business_hours` é chamada em `useBusinessHoursCheck.ts`). Nenhum tipo gerado da V2 menciona as quatro primeiras.
- Se `useWarRoomData` refaz a busca a cada 30 s (o `setInterval` do componente só atualiza o relógio) e se o Confetti é canvas JS.
- Runtime: papéis efetivos (`hasRole` hierárquico da V3 x lista explícita da V2), comportamento do QR com a Evolution Go, e se `IntegrationsPanel` foi retirado de propósito (o teste `ConnectionCard.sem-integracoes` sugere que sim; checar cartões irmãos não integrados).
- Cartões `done` ainda não integrados na `.integrador`: checar cartões irmãos antes de criar L-C1/L-C2/L-D1.
