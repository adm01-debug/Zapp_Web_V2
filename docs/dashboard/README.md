# Dashboard — fonte de dados por card

Mapa "de onde cada número vem" do Dashboard (aberto no E48, 25/09/2026, a partir do estado real do
código/banco em produção): não é um design doc, é o registro pra próxima sessão não redescobrir na marra.
A linhagem vigente do Dashboard é o documento externo
`docs/reconciliation/sources/Plano_Dashboard_100_Etapas_2026-09-30.md` (100 etapas) — origem distinta do
E48, que não o substitui. Se um card mudar de fonte, atualize esta tabela na mesma PR.

## Matriz de escopo (regra oficial, ratificada E03)

| Card/KPI | Agente comum | Staff (admin/supervisor) |
|---|---|---|
| Conversas abertas / fila / não lidas | Escopo FILA (rotulado "Fila:") | Global |
| Resolvidas, tempo de resposta, SLA violado, metas, XP | PESSOAL (rotulado "Minhas") | Global + por agente |
| Atendentes online, saúde de filas, equipe, ranking | OCULTO | Visível |
| Abas | Visão Geral, Metas, Satisfação | Todas (+ Analytics, IA, SLA, Equipe, Sentimento, Relatórios) |

Gate de aba: `AGENT_TAB_VALUES` em `DashboardView.tsx` (`Set(['overview','goals','satisfaction'])`);
`isStaff = isAdmin || isSupervisor` (`useUserRole()`). Sem deep-link por URL — seleção de aba é `useState`
local, sem `searchParams` (auditado no E37).

## Fonte de dados por card (Visão Geral)

| Card | Hook | RPC / tabela | Filtro de papel |
|---|---|---|---|
| Conversas Abertas / Não Lidas | `useDashboardStats.ts` (`contactsQuery`) + `useRealtimeDashboard` | RPC `dashboard_contact_counts(p_queue, p_agent, ...)` | trava `p_agent` server-side p/ não-staff (E33) |
| Tempo Médio de Resposta (p50, tooltip p90) | `useDashboardKpi.ts` | RPC `dashboard_kpi(p_since, p_queue, p_agent)` — `percentile_cont(0.5)`/`(0.9)` no servidor | idem |
| Atendentes Online / Minhas Conversas Ativas | `DashboardKpiRow.tsx` (prop `isStaff`) | `stats.onlineAgents/totalAgents` (staff) vs `myActiveConversations` (agente, calculado em `DashboardView.tsx`) | render condicional, não RPC |
| Resolvidas Hoje | `useDashboardKpi.ts` | mesma RPC `dashboard_kpi` (`resolvedToday`/`resolvedHourly8`) | idem |
| Gráfico de Volume (8 dias) | `useTodayHourlyVolume.ts` | RPC `dashboard_hourly_volume(p_days, p_queue, p_agent)` | trava `p_agent` server-side (E33) |
| Saúde das Filas / Fila com maior volume | `useQueueHealth.ts` (agora `useMemo` puro) | mesma RPC `dashboard_contact_counts` (campo `queues[]`, breakdown) | staff-only (aba) |
| Equipe em Destaque (ranking) | `useLeaderboard.ts` | RPC `dashboard_leaderboard(p_period, p_limit)` (migration `20260926112500_dashboard_leaderboard_rpc.sql`) — XP/resolvidas/mensagens/tempo de resposta/satisfação calculados **por período no servidor**; `agent_achievements` lido à parte | staff-only (aba Equipe) |
| Desafios do Dia | `useGoalsDashboard.ts` | tabela de goals (seed por papel, migration `20260925190001`) — cai em fallback hardcoded só se config real ausente (E42) | agente = próprio, staff = equipe |
| Alertas de Sentimento | `useSentimentData.ts` | RPC `dashboard_sentiment_alerts(p_since)` (SECURITY DEFINER com guard interno, em vez de abrir a policy de `audit_logs` — E39) | staff-only, fail-closed |
| Análises de Sentimento / CSAT / NPS | `useSentimentData.ts` e telas de Satisfação | tabelas `conversation_analyses`, `csat_surveys`, `nps_surveys` — RLS nativa já escopa agente=próprio/staff=tudo | RLS nativa (sem RPC) |
| Relatórios Agendados | `useScheduledReportConfigs.ts` / `ScheduledReportsManager.tsx` | tabela `scheduled_report_configs` — **owner-only** desde o E40: cada usuário vê/edita só os próprios relatórios (`created_by`), admin vê tudo. Migrations `20260926113806_scheduled_report_configs_owner_only.sql` e `20260926140000_fix_scheduled_report_configs_insert_owner_check.sql` | `created_by` = profile do usuário, ou admin |
| XP / Nível | `agent_stats.xp`/`level` (via `useLeaderboard`/gamificação) | triggers atualizam `xp` atomicamente; `level` recalculado por `update_agent_level()` (trigger separado, preexistente) | mesma fonte do ranking |

## Padrão de RLS/RPC do módulo

- Guard de staff: função `is_admin_or_supervisor(auth.uid())` (SQL, `SECURITY DEFINER`) — checa
  `user_roles.role IN ('admin','supervisor')`. É o padrão em quase toda tabela/RPC do dashboard.
  Exceção histórica corrigida: `audit_logs` usava `has_role(auth.uid(),'admin')` (só admin) — o card de
  Alertas de Sentimento passou a usar a RPC dedicada `dashboard_sentiment_alerts` em vez de abrir a policy.
  Ponto vivo: `useAIStats.ts` **ainda lê `audit_logs` direto do client** (`action = 'sentiment_alert'`).
- RPC com guard interno em vez de abrir RLS: quando um card precisa de uma fatia de uma tabela sensível/
  compartilhada, o padrão deste módulo é criar uma RPC `SECURITY DEFINER` escopada e com guard de papel
  interno (fail-closed: não-staff recebe 0 linhas), em vez de afrouxar a policy da tabela inteira. Usado em
  `dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume`, `dashboard_sentiment_alerts`.
- Filtro `p_agent`/`p_queue`: as RPCs que aceitam esses params travam `p_agent` pro próprio `auth.uid()`
  quando quem chama não é staff, independente do valor recebido do client (E33) — não confiar no front.

## Armadilhas de ambiente conhecidas (banco self-hosted, VPS AtomicaBR)

- `db_apply_migration` (MCP Supabase) está bugado neste projeto (referencia coluna `executed_at`
  inexistente). Workaround: DDL via `db_query` direto + `INSERT` manual em
  `supabase_migrations.schema_migrations (version, name, statements) ... ON CONFLICT DO NOTHING`.
- Migration que mexe em produção (DDL) fica com a PR **aberta**, sem merge automático, até Joaquim aprovar
  — mesmo que a migration já tenha sido aplicada ao vivo (regra 8 do fluxo). PR #764 segue esse padrão
  nesta fase (#750 já foi mergeada em 25/09/2026 19:11:51 UTC).
- `db_query` deste MCP: multi-statement roda numa transação só, mas só devolve linhas do formato
  "ok/rows_affected" quando várias queries vão no mesmo call — para ler resultado de `SELECT`, rodar uma
  query por chamada.
- Repo de altíssima concorrência: várias sessões trabalham o mesmo plano ao mesmo tempo. Sempre conferir
  PRs abertas (`github_list_pull_requests`) E o ledger de migrations (`supabase_migrations.schema_migrations`)
  antes de assumir que uma etapa não foi feita — o doc do plano historicamente ficou desatualizado (etapas
  já mergeadas por outra sessão, mas não marcadas `[x]` aqui).

## Débitos conhecidos (não corrigidos, fora do escopo literal das etapas que os encontraram)

- **Corrigido:** o ranking do card Equipe não é mais all-time. `useLeaderboard.ts` deixou de ler `agent_stats`
  sem recorte e passou a chamar a RPC `dashboard_leaderboard(p_period, p_limit)` — o seletor hoje/semana/mês
  muda o recorte no servidor (antes era cosmético).
- `DemandPrediction.tsx` — o texto que rotulava o card como previsão por IA não existe mais: o card se chama
  "Previsão de Demanda" com um badge "IA". O débito remanescente é outro (DASH-CONTROLS-001): a confiança de
  95% e a capacidade padrão 35 seguem heurísticas, não medidas.
- ~~E34/E35/E36~~ — corrigido 25/09/2026: PR #750 (branch ainda nomeada `e31-e33`) teve o escopo
  expandido por outra sessão concorrente e passou a cobrir E34 (aviso `dash-kpis-period-notice` em
  `DashboardView.tsx` quando `period !== 'today'`), E35 (`useDashboardUrlFilters.ts`, filtros na URL) e
  E36 (`supabase/tests/dashboard_rpc_filters.sql`) também. Ver plano — não é mais débito.
- E46 (smoke E2E Playwright) bloqueado por falha de conexão do MCP nesta sessão; E47 (Web Vitals real)
  sem ferramenta disponível (Speed Insights não habilitado no projeto Vercel).

- **E53 (card "Sessões Search Box no mês / teto") — registrado como NÃO FEITO, com o motivo.** Etapa do
  plano do Search Box (`docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`), **não** do Dashboard — linhagem
  distinta, não contar como etapa do Dashboard.
  A etapa pede o card "só se já existe painel de KPIs com slot". Este README tem a **matriz de escopo** por
  audiência (**Agente comum** / **Staff**) e a **fonte de dados por card da Visão Geral** — não há slot
  de **KPI de sistema** (quota/consumo de infraestrutura), que é a natureza desta métrica: ela não é por
  agente nem por fila, é consumo do mês contra um teto. O lugar próprio seria o painel de telemetria
  (`src/pages/AdminTelemetriaPage.tsx`, que já reúne os cards de sistema via `TelemetryStatsCards`),
  o que é um card novo — não a inserção num slot existente. Decisão de produto, não deste plano.
- **Correção de número:** o texto da etapa diz "/ 500", mas o teto real é
  `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT`, cujo **padrão é 450** (E48, `src/lib/mapboxCostGuard.ts`).
  Qualquer card que venha a existir deve ler o limite configurado, nunca cravar 500.
- **A fonte de dado já existe** desde o E52: a view `public.searchbox_usage_daily` (aplicada no banco
  canônico) traz sessões e degradações por dia, no fuso America/Sao_Paulo — o card seria uma soma por
  mês sobre ela, sem RPC nova.
