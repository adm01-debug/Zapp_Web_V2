# Dashboard — fonte de dados por card

E48 (`claude/PLANO_DASHBOARD_50_ETAPAS.md`, Fase 6). Gerado em 25/09/2026 a partir do estado real do
código/banco em produção — não é um design doc, é um mapa de "onde cada número vem" pra próxima sessão
não redescobrir na marra. Se um card mudar de fonte, atualize esta tabela na mesma PR.

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
| Equipe em Destaque (ranking) | `useLeaderboard.ts` | tabela `agent_stats` (+ `agent_achievements`) — atualizada por triggers `trg_gamification_on_closure`/`trg_gamification_on_message_sent` (E38/E43) | staff-only (aba Equipe) |
| Desafios do Dia | `useGoalsDashboard.ts` | tabela de goals (seed por papel, migration `20260925190001`) — cai em fallback hardcoded só se config real ausente (E42) | agente = próprio, staff = equipe |
| Alertas de Sentimento | `useSentimentData.ts` | RPC `dashboard_sentiment_alerts(p_since)` (SECURITY DEFINER, guard interno — não lê `audit_logs` direto, E39) | staff-only, fail-closed |
| Análises de Sentimento / CSAT / NPS | `useSentimentData.ts` e telas de Satisfação | tabelas `conversation_analyses`, `csat_surveys`, `nps_surveys` — RLS nativa já escopa agente=próprio/staff=tudo | RLS nativa (sem RPC) |
| Relatórios Agendados | `useScheduledReportConfigs.ts` / `ScheduledReportsManager.tsx` | tabela `scheduled_report_configs` — recurso staff-only compartilhado, não owner-only (E40) | `is_admin_or_supervisor` nas 4 policies |
| XP / Nível | `agent_stats.xp`/`level` (via `useLeaderboard`/gamificação) | triggers atualizam `xp` atomicamente; `level` recalculado por `update_agent_level()` (trigger separado, preexistente) | mesma fonte do ranking |

## Padrão de RLS/RPC do módulo

- Guard de staff: função `is_admin_or_supervisor(auth.uid())` (SQL, `SECURITY DEFINER`) — checa
  `user_roles.role IN ('admin','supervisor')`. É o padrão em quase toda tabela/RPC do dashboard.
  Exceção histórica corrigida: `audit_logs` usava `has_role(auth.uid(),'admin')` (só admin) — não mais
  lido direto pelo dashboard desde E39 (RPC dedicada).
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

- `useLeaderboard.ts` aceita `timeRange` (hoje/semana/mês) mas a query em `agent_stats` é sempre all-time —
  o seletor de período do card Equipe é cosmético hoje (achado do E38, não corrigido).
- `DemandPrediction.tsx` ainda usa o texto "Previsão IA" (mesmo problema do E41, mas em componente
  diferente — fora do escopo daquela etapa).
- ~~E34/E35/E36~~ — corrigido 25/09/2026: PR #750 (branch ainda nomeada `e31-e33`) teve o escopo
  expandido por outra sessão concorrente e passou a cobrir E34 (aviso `dash-kpis-period-notice` em
  `DashboardView.tsx` quando `period !== 'today'`), E35 (`useDashboardUrlFilters.ts`, filtros na URL) e
  E36 (`supabase/tests/dashboard_rpc_filters.sql`) também. Ver plano — não é mais débito.
- E46 (smoke E2E Playwright) bloqueado por falha de conexão do MCP nesta sessão; E47 (Web Vitals real)
  sem ferramenta disponível (Speed Insights não habilitado no projeto Vercel).
