# PROMPT DE EXECUÇÃO — REDESIGN "NAVY OPERATIONAL" DO MÓDULO DASHBOARD | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR)
> **Repo:** `adm01-debug/Zapp_Web_V2` — **worktree próprio** `/workspace/repos/Zapp_Web_V2-dashboard`, branch `redesign/dashboard-navy-v1`, **base = `origin/redesign/contatos-navy-v2`** (herda Inter, tokens navy, sidebar 234, PageHeader `variant`/`topRight`). Nunca `main` como base enquanto o PR de Contatos não estiver mergeado.
> **Roda em paralelo** com o redesign de Contatos (checkout principal em `/workspace/repos/Zapp_Web_V2`, preview na porta 4173, QA em `/workspace/qa`). **Este plano usa porta 4174, `/workspace/qa-dashboard`, logs `redesign-dashboard-*`. Não tocar no checkout principal.**
> **Tela alvo:** `?view=dashboard` (tab `overview` = Visão Geral). Resolução primária de uso: **1920×1080** (§4 do Prompt Mestre). Resolução de fidelidade: **1536×1024 da referência**, medida 1:1 em px CSS.
> **Referência visual:** imagem "ChatGPT_Image_6_de_set_2026_19_17_55.png" (1536×1024). **Toda a paleta e geometria dela já foram medidas por script e estão na seção 2 — a seção 2 é a fonte da verdade executável.** O PNG em si só é necessário para o composite opcional E.4: se estiver em `docs/design/dashboard-reference.png`, use; se não estiver, E.4 é pulado e os gates E.2/E.3 bastam (mesma regra do plano de Contatos).
> **Prompt Mestre (GPT, "WIDE 24" Full HD", 104 seções):** as regras relevantes (densidade, wide-first, primeira dobra em 1920×1080, sem decoração, preservação funcional) já estão incorporadas aqui. Se o arquivo `docs/design/PROMPT_MESTRE_DASHBOARD_WIDE_24_FULLHD.md` existir no repo, leia-o; se não existir, siga este plano. Onde ele e a referência divergem (ex.: KPI value 24–32px vs 22px medido; chart 240–320px vs card de 259px), **a referência vence** (§3 dele mesmo: "a imagem define a intenção visual").
> **Ledger (obrigatório):** `docs/design/REDESIGN_DASHBOARD_STATUS.md`
> **Versão:** 1.0 — 07/09/2026 — escrito após auditoria do código real e post-mortem do plano de Contatos (3 sessões, 2 travamentos por hook de pre-push).

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 O que aprendemos no plano de Contatos (fatos, não opinião)

| Fato | Consequência neste plano |
|---|---|
| `claude -p` morreu 2× esperando task em background que rodava o hook `.husky/pre-push` (typecheck-ratchet + lint-ratchet, ~3 min) | **Sempre `git push --no-verify origin redesign/dashboard-navy-v1`.** Os gates rodam manualmente ANTES do commit (etapa de fechamento de cada fase); o hook só os repetiria. |
| Preview da Vercel por branch está atrás de SSO (`302 → vercel.com/sso-api`), sem bypass secret | QA automatizado roda contra `npm run build && npx vite preview --port 4174` local, apontando para o Supabase Cloud oficial (`tnnnlkbymytvtqngbbqh`). Produção (etapa 100) usa a URL pública. |
| `--primary`, `--accent`, `--ring`, `--secondary` são **reescritos em runtime** por `ThemeInitializer.tsx`/`useThemePreset.ts` a partir do preset ativo (`corporate`) | Já corrigido na branch base (`ffbb2d12`). Não redefinir esses tokens aqui; se uma cor "não pega", verifique `CSS_VARS_TO_APPLY` em `presets.ts` antes de mexer em CSS. |
| `shot.mjs` do plano anterior usava a chave errada de localStorage para a sidebar | A chave real é `zapp-sidebar-collapsed` (`'false'` = expandida). Já corrigido nos scripts de `/workspace/qa`; copie-os. |
| `/root` é efêmero; `.credentials.json` vem vazio após recreate | O comando de disparo exporta `CLAUDE_CODE_OAUTH_TOKEN` de `/run/secrets/claude_code_oauth_token` e `IS_SANDBOX=1` (já em `/workspace/.local/env.sh`). |
| Node do sistema é v20 e `engines` pede ≥24; `bun 1.3` está disponível | `bun install --frozen-lockfile` no worktree. Scripts npm rodam normalmente. |

### 0.2 Por que o Dashboard atual "não é o mockup" (verificado no código em 07/09)

- `DashboardView.tsx` renderiza **Aurora + FloatingParticles + Parallax + blur de entrada + neon-underline + glow-gradient-pulse** — tudo proibido pelo Prompt Mestre (§39, §99) e ausente na referência.
- A gamificação do header é **hardcoded**: `AnimatedBadge value="1.250"`, `"89"`, `"7"`, `LevelProgress currentXP={1250} requiredXP={2000} level={12}`. A referência copiou esses números. Existe fonte real: `useAgentGamification()` → `agent_stats` (`xp`, `level`, `current_streak`, `achievements_count`).
- A Visão Geral é `RealtimeMetricsPanel` (5 métricas de mensagens) + `ProgressiveDisclosureDashboard` (3 níveis de widgets: stats, challenges, queues, activity, ai-stats, leaderboard, achievements, mini-games). `WidgetConfigSheet.tsx` e `DraggableWidgetContainer.tsx` **não são usados por ninguém** (sem UI de configuração exposta).
- `useDashboardData` devolve `queuesStats[].waitingCount: 0` e `recentActivity: []` **hardcoded**. Fontes reais existem: `queue_positions`, `conversation_events` (tipos reais no código: `assign`, `unassign`, `transfer`, `queue_transfer`, `overload_reassign`, `absence_reassign`), `conversation_closures`.
- "Metas do Dia" da referência (`Responder 10 mensagens`, `Resolver 5 conversas`, `Tempo médio < 3min`, `Sem pendências às 18h`) são os **títulos hardcoded do `ChallengesWidget`**. O sistema real de metas é `useGoalsDashboard()` → `goals_configurations`.
- `useDemandPrediction(externalData, currentCapacity = 35)`: a "Capacidade máxima" da referência é esse `35` hardcoded. **Não existe** configuração de capacidade em nenhuma tabela (grep em `types.ts`: zero ocorrências de `capacity|max_concurrent`).
- Tab `ai` renderiza `AIQuickAccess` **e** `CSATDashboard` (CSAT dentro da aba de IA).

### 0.3 Regras invioláveis (herdadas do plano de Contatos + específicas)

1. **Nenhum checkpoint fecha sem evidência** (screenshot + saída dos scripts + SHA) escrita no ledger. "Feito" sem arquivo é mentira.
2. **Ordem: fundação → shell → linhas de cards de cima para baixo.** Não abra a Fase 6 antes do CP5.
3. **Nunca escreva "pixel-perfect", "idêntico", "validado".** Escreva o número.
4. **Diff mínimo por arquivo.** Reescrita autorizada apenas em: `DashboardView.tsx`, `DashboardFilters.tsx` (apresentação), `RealtimeMetricsPanel.tsx` (vira `DashboardKpiRow`). Componentes compartilhados (`ViewContainer`, `Tabs`, `Card`, `Select`, `Badge`) só via prop/variante nova com default = comportamento atual.
5. **Zero regressão funcional** — seção 5 é contrato.
6. **Zero backend.** Nenhuma migration/RLS/RPC/Edge Function. Queries novas = `select` em tabelas já existentes (`conversation_closures`, `conversation_sla`, `conversation_events`, `queue_positions`, `messages`), sempre em hooks com `useQuery` + `staleTime`.
7. **Zero dado hardcoded.** Nomes, números, gráficos e frases da referência são ilustrativos. Sem fonte real → o elemento **não renderiza** (espaço reservado). Lista completa na seção 3.
8. **Não apagar arquivos** que ficarem sem uso (`FloatingParticles.tsx`, `WidgetConfigSheet.tsx`, `DraggableWidgetContainer.tsx`, `ProgressiveDisclosureDashboard.tsx`): remover o uso, registrar no ledger. Zero churn.
9. **Ratchets são gates**: `npm run typecheck` (0 erros), `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check`, `npx vitest run src/components/dashboard src/hooks/dashboard src/hooks/analytics`. Armadilha do lint-ratchet: inserir código *antes* de violação legada desloca o `contextHash` — insira *depois*.
10. **Branch e PR, nunca push em `main`.** Um commit por fase: `redesign(dashboard): fase N — <o que>` + commit `docs(dashboard): CPN fechado`. **Push sempre com `--no-verify`.**
11. **Sem biblioteca nova.** Recharts 3.8, framer-motion 12, lucide, shadcn, TanStack Query já existem.
12. **Máximo 3 iterações por loop visual.** Na 3ª, registre o resíduo e siga.
13. **Shell é `dash`**: sem `[[ ]]`, arrays, `source` (use `.`). Sem `python3`: QA em Node.
14. **Shell global é compartilhado e já decidido pela branch base**: sidebar 234px, `--background 216 58% 8%`, `--card 215 48% 10%`, `--primary 217 100% 54%`. A referência do dashboard mede sidebar 193px e fundo `#0b0d12` (ΔE 8.2 do token). **NÃO altere tokens do shell nem a sidebar.** Um app, uma paleta. O gate de cor para tokens compartilhados é "= token" (informativo vs. referência); só os tokens `--dash-*` novos têm gate contra a referência.
15. **Se o plano contradisser o código real, o código vence — registre a divergência no ledger antes de decidir.**
16. **Não toque em `src/components/contacts/**`, `src/components/layout/Sidebar*.tsx`, `PageHeader.tsx`, `tokens.css .dark`** — são da branch de Contatos, ainda em movimento. Em `tokens.css` só **acrescente** linhas no fim do `:root` (Apêndice A).
17. **Nunca `pkill -f` / `killall` com padrão genérico** (porta, `vite`, `node`, `claude`). O argv do próprio `claude -p` contém o prompt inteiro — `pkill -f "4174"` matou a sessão do dashboard em 07/09 (exit 144, processo vira zombie e o watchdog não vê). Para matar o preview: `kill $(cat /workspace/logs/<plano>-preview.pid)` ou `fuser -k <porta>/tcp`; ao relançar, `setsid nohup … &` e grave o PID no mesmo arquivo.

---

## 1. CONTEXTO VERIFICADO (leitura feita em 07/09/2026, HEAD `9e871480` da branch base)

### 1.1 Stack e comandos
Vite 8 · React 19 · TS 5.8 · Tailwind 3.4 · shadcn/Radix · framer-motion 12 (barrel `@/components/ui/motion` com `AnimatedCounter`, `AnimatedProgress`, `MotionCard`…) · recharts 3.8 · TanStack Query 5 · lucide · date-fns 3. Scripts: `dev`, `build`, `preview`, `lint`, `typecheck` (= `tsc -b --force`), `test` (vitest), `implicit-any-check`, `test:e2e`. Husky `pre-commit` + `pre-push`.

### 1.2 Arquivos do módulo (`src/components/dashboard/`, 5.704 linhas)
`DashboardView.tsx` (175, orquestrador) · `DashboardFilters.tsx` (309: período `today|yesterday|week|month|custom` + calendário + fila + agente + refresh) · `RealtimeMetricsPanel.tsx` (182) · `ProgressiveDisclosureDashboard.tsx` (102) · `DashboardWidgetRenderer.tsx` (321: `stats`, `challenges`, `ai-stats`, `queues`, `leaderboard`, `activity`, `achievements`, `mini-games`) · `DashboardSectionHeader.tsx` (94, seção colapsável com variantes) · `GamificationEffects.tsx` (139: `AnimatedBadge`, `LevelProgress`) · `FloatingParticles.tsx` · `GoalsDashboard.tsx` + `GoalsConfigDialog.tsx` · `AIQuickAccess.tsx` (221: 6 features com `route`/`navigateToView`) · `AIStatsWidget.tsx` · `SLAMetricsDashboard.tsx` · `AgentPerformancePanel.tsx` · `SatisfactionMetrics.tsx` + `SatisfactionAgentRanking.tsx` · `SentimentTrendChart.tsx` + `SentimentTabContent.tsx` + `useSentimentData.ts` · `ScheduledReportsManager.tsx` · `DemandPrediction.tsx` · `ActivityHeatmap.tsx` · `ConversationHeatmap.tsx` · `MiniSparkline.tsx` · `TrendIndicator.tsx` (`calculateTrend`, `TrendIndicator`, `CompactTrendBadge`, `TrendSparkline`) · `MetricComponents.tsx` · `WarRoomDashboard.tsx` · `metrics/`, `war-room/`. Fora: `src/components/csat/CSATDashboard.tsx`, `src/components/leaderboard/Leaderboard.tsx`, `src/components/effects/{AuroraBorealis,ParallaxContainer}.tsx`.

### 1.3 Hooks e dados reais (fontes confirmadas)

| Hook | Fonte | Devolve |
|---|---|---|
| `useDashboardData(filters)` → `useDashboardStats` | `profiles`, `contacts`, `queues(queue_members)`, `conversation_sla` (últimas 50) | `openConversations` (contacts com `assigned_to`), `pendingConversations` (sem `assigned_to` com `queue_id`), `resolvedToday` (aprox.), `totalConversations`, `onlineAgents/totalAgents`, `avgResponseTime`, `queuesStats[]`, `refetch` |
| `useRealtimeDashboard()` | `messages`, `contacts` + realtime | `messagesThisHour/LastHour`, `messagesPerMinute`, `activeConversationsNow`, `newContactsToday`, `unreadMessages`, `metricsHistory[60]{timestamp, messagesPerMinute, activeConversations, avgResponseTimeSeconds}`, `isConnected`, `lastMessageAt` |
| `useAgentGamification()` | `profiles`, `agent_stats`, `agent_achievements` | `stats{xp, level, current_streak, best_streak, conversations_resolved, achievements_count, …}`, `achievements[]` + `levelUtils.{calculateLevel, xpForNextLevel, levelProgress}` |
| `useLeaderboard()` | `agent_stats(profiles)`, `agent_achievements` | `agents[]{name, avatar, xp, level, streak, messagesHandled, avgResponseTime, satisfaction, rank, isOnline}` |
| `useSLAMetrics(period)` | `conversation_sla`, `profiles` | `overall{firstResponse{total,onTime,breached,rate}, totalConversations, overallRate}`, `byAgent[]{agentId, agentName, avatarUrl, overallRate}` |
| `useGoalsDashboard()` | `goals_configurations`, `messages`, `contacts`, `conversation_analyses` | `goals[]{label, target, current, unit, icon, color, priority}`, `completedGoals`, `overallProgress`, `period/setPeriod`, `configDialogOpen/setConfigDialogOpen` |
| `useDemandPrediction()` | `messages` (7 dias, média por hora) | `data[24]{time, actual?, predicted, lower, upper, isPrediction}`, `insights{maxPredicted, avgPredicted, currentActual, trend, peakTime}` (`capacityRisk` usa o `35` hardcoded — **não usar**) |
| `useCSAT(period: 'today'\|'week'\|'month')` | `csat_surveys` | `stats{average, total, distribution{1..5}, trend}` |
| `useSentimentData(period)` | `conversation_analyses`, `audit_logs`, `profiles` | `dailyData[]`, `stats`, `alerts`, `agentData` |
| `AIQuickAccess` (componente) | estático + rotas | 6 features: Sugestões de Resposta, Análise de Conversa, Alertas de Sentimento, Resumo Automático, Transcrição de Áudio, Tendências de Sentimento |

Tabelas existentes sem hook e que este plano passa a consultar (só `select`): `conversation_closures{contact_id, closed_by, close_reason, created_at}`, `conversation_sla{contact_id, first_message_at, first_response_at, first_response_breached, resolution_breached, resolved_at}`, `conversation_events{contact_id, event_type, from_agent_id, to_agent_id, from_queue_id, to_queue_id, performed_by, metadata, created_at}`, `queue_positions{contact_id, queue_id, position, entered_at, estimated_wait_minutes}`, `messages{created_at, …}`.

### 1.4 Shell (branch base)
`ViewRouter.tsx` monta `<ViewContainer fullScreen={FULL_SCREEN_VIEWS.has(v)} ownScroll={OWN_SCROLL_VIEWS.has(v)}>`; `ViewContainer` aplica `p-[var(--layout-gutter)]` (= 36px). `--sidebar-w: 234px`. `ContactsTopActions.tsx` (Contatos, CP3): o sino abre a paleta de comandos (`open-command-palette`) porque **não existe central de notificações** — mesmo mecanismo aqui.

---

## 2. SPEC VISUAL MEDIDA (script sobre `dashboard-reference.png` 1536×1024, px 1:1)

### 2.1 Geometria detectada (bounding boxes por luminância, 17 blocos)

| Bloco | x0–x1 (w) | y0–y1 (h) | Observação |
|---|---|---|---|
| Sidebar (referência) | 0–193 | — | **herdar 234 da base; ignorar** |
| Área de conteúdo | 206–1523 (1317) | 0–1011 | gutter 13 esq/dir/inf → **16 no app** (`compactGutter`) |
| Faixa do topo (sino + usuário) | 1385–1520 | 5–23 (h≈18 em faixa de 28) | acima do header, alinhada à direita |
| Header card | 206–1523 | 33–103 (**70**) | tile ícone 40×40 em (218,48); título x=266 |
| Tabs (9 pills) | 207–1341 | 113–144 (**31 → 32**) | ativa "Visão Geral" 139w |
| Banner saudação | 206–1523 | 153–226 (**73**) | avatar 44, tile nível 34, chips h 30 |
| KPI ×5 | 206–449 · 458–710 · 719–973 · 983–1257 · 1266–1523 | 234–329 (**95**) | gap 9–10; larguras desiguais na referência = ruído da IA → 5 colunas iguais |
| Linha 2: Volume · Agora · Metas | 206–839 (633) · 848–1185 (337) · 1194–1523 (329) | 340–599 (**259**) | `[1.9fr_1fr_1fr]` → 632/333/333 |
| Linha 3: Saúde das Filas · Atividade · Equipe | 206–730 (524) · 740–1119 (379) · 1128–1523 (395) | 608–828 (**220**) | `[4fr_3fr_3fr]` → 519/389/389 |
| Linha 4: IA · CSAT · Sentimento | 206–729 (523) · 738–1110 (372) · 1119–1525 (406) | 838–1011 (**173**) | mesmo grid da linha 3 |
| Gaps verticais | — | header→tabs 10 · tabs→banner 9 · banner→KPI 8 · KPI→L2 11 · L2→L3 9 · L3→L4 10 | **gap 10** (`gap-2.5`) em tudo |

### 2.2 Paleta (mediana de regiões planas; alvo por token)

**Tokens compartilhados (já na base — usar, não redefinir):** `--background` (ref `#0b0d12`, ΔE 8.2 informativo) · `--card` para todos os cards (ref `#13171e`, ΔE 5.7; header card ref `#0d121e`, ΔE 3.4) · `--card-elevated` para o banner (ref `#0f1c2e`) · `--border` (ref `#252e3d`/`#1c232f`, ΔE 5.9) · `--input` para selects/chips de filtro (ref `#151a24`, ΔE 5.2) · `--primary` para tab ativa, tile de nível, barra de progresso, linha do gráfico (ref `#1663fd`, ΔE 8.1) · `--accent` para item ativo da sidebar (ref `#0b2b5f`) · `--kpi-tile-blue` para **tiles de header de seção** (ref `#0c2d78`, ΔE 1.9) · `--success` só onde a base já usa.

**Tokens novos `--dash-*` (Apêndice A; gate ΔE ≤ 8 contra a referência):**

| Token | HSL | HEX ref | Onde |
|---|---|---|---|
| `--dash-tile-blue` | `221 88% 29%` | `#09328a` | tile KPI 1, tile "Agora › Conversas ativas" (`#0639a0`, ΔE≈4), tile Metas |
| `--dash-tile-red` | `349 62% 30%` | `#7a1d2e` | tile KPI 2, tile "Agora › SLA", tile IA "Alertas de Sentimento" |
| `--dash-tile-green` | `156 73% 18%` | `#0c5134` | tiles KPI 3/4/5, tile "Agora › Aguardando", badge Bom/Excelente (`#0c4532`), tile IA "Transcrição" |
| `--dash-tile-violet` | `260 69% 37%` | `#491d9f` | tile "Agora › Fila com maior volume" |
| `--dash-tile-amber` | `43 80% 24%` | `#6f530c` | tile IA "Sugestões", badge Atenção (`#72530b`) |
| `--dash-blue-fg` | `210 100% 57%` | `#2694ff` | barras KPI 1, dot de atividade |
| `--dash-red-fg` | `357 94% 63%` | `#f94a53` | barras KPI 2, delta negativo, texto "Em risco/violado", barra CSAT 1–2★ (`#f46d4d`, ΔE≈8) |
| `--dash-green-fg` | `153 90% 42%` | `#0bcc73` | barras KPI 3/5 (`#1fd080`, `#13d67a`), delta positivo, arco do donut (`#08c97a`), check (`#0bbc6a`), barra CSAT 4–5★ (`#09cc74`), barra SLA ≥95%, linha Positivo |
| `--dash-violet-fg` | `282 95% 66%` | `#cb57fb` | barras KPI 4 (a referência mistura tile verde + barras violeta — replicar como medido; ver resíduos) |
| `--dash-amber-fg` | `45 90% 51%` | `#f3bc11` | estrelas CSAT, texto do badge Atenção, ícone IA "Sugestões", medalha ouro (`#e4a216`) |
| `--dash-yellow-fg` | `52 58% 56%` | `#d0bf4f` | barra CSAT 3★ |
| `--foreground-secondary` | `215 30% 78%` | `#bac7dc` | subtítulos, labels de KPI, descrições (a base já usa este valor literal em `ContactCard`) |
| chip "Ao vivo"/"Tempo real"/"Ativo" | `bg-success/15 border-success/30 text-success` | ref `#133531` | — |
| botão refresh | `bg-primary/25 border-primary/40 text-primary` | ref `#133470` | header |
| tooltip do gráfico | `bg-popover border-border` | ref `#1b212c` | — |
| track de progresso | `bg-muted/60` | ref `#242d40` | nível, equipe, CSAT (`#202530`), donut (`#14181f` → `bg-muted/40`) |
| item de checklist (Metas) | `bg-muted/40` | ref `#1a1f29` | — |
| mini-tile IA | `bg-muted/30 border-border/60` | ref `#181d26` | — |
| avatar iniciais | `getAvatarColor(name)` (lib existente) | ref `#2d61dd` (AO), `#0caf6a` (MC), `#d086fa` (RS) | — |
| ícones dentro de tiles | `text-white/90` | ref `#cff0fb`…`#ffffff` | tintas quase brancas |

### 2.3 Tipografia (Inter, herdada; cap-height medida)

| Elemento | px / peso | Cor |
|---|---|---|
| Título "Dashboard" | **24 / 700**, tracking -0.02em | foreground |
| Subtítulo do header | 13 / 400 | foreground-secondary |
| Chip de período (2 linhas) | "Hoje" 12 / 600 · data 11 / 400 | foreground · muted-fg |
| Selects do header | 13 / 500 | foreground |
| Tab | 13 / 500 (ativa 600), ícone 14 | ativa branco · inativa foreground-secondary |
| Saudação | **20 / 700** (+ emoji 👋) | foreground |
| Sub da saudação | 12 / 400 | foreground-secondary |
| "Nível 12" | 13 / 600 · "1.250 / 2.000 XP" 11 / 400 · "63%" 11 / 600 | — |
| Chips XP/⭐/🔥 | 12 / 600, ícone 14 | azul-claro / amber / red-fg |
| Frase motivacional | 12 / 400, 2 linhas | foreground-secondary |
| KPI label | 12 / 500 | foreground-secondary |
| KPI valor | **22 / 700**, `tabular-nums` | foreground |
| KPI delta | 11 / 600 (↑↓ 12px) + "vs. ontem" 11 / 400 | green-fg / red-fg · muted-fg |
| Título de card | **15 / 700** · subtítulo 12 / 400 | foreground · foreground-secondary |
| "Ver todas →" | 11 / 500 | foreground-secondary |
| Selects de card | 11 / 500 | foreground |
| Eixos/legenda de gráfico | 11 / 400 | muted-fg |
| Tooltip | "Agora" 11 / 400 · "24 conversas" 12 / 600 · "14% acima da média" 11 / 400 | — |
| "Agora" valores | 18 / 700 · labels 12 / 400 · "Comercial (8)" 13 / 600 | — |
| Donut "2/4" 16 / 700 · "50%" 12 / 400 · "Continue assim!" 12 / 600 · sub 11 / 400 | — |
| Checklist | 11 / 500 | foreground (concluído) · foreground-secondary |
| Tabela: header 11 / 500 · células 12 / 400 · badge 11 / 600 | muted-fg · foreground · cor semântica |
| Atividade: nome 12 / 600 · ação 11 / 400 · "há 2 min" 11 / 400 | — |
| Equipe: nome 12 / 600 · "42 resolvidas" 11 / 400 · "98% SLA" 11 / 600 | — |
| IA mini-tile: título 12 / 600 · descrição 11 / 400 (2 linhas) | — |
| CSAT "4.8" **30 / 700** · "+12%" 11 / 600 · "vs. período anterior" 11 / 400 · rótulos "5 ★" 11 / 400 · "72%" 11 / 600 | — |
| Sentimento: legenda 11 / 400 · eixos 11 | — |

### 2.4 Componentes (medidas-alvo, tolerâncias no E.2)

| Elemento | Medida | Tol. |
|---|---|---|
| Gutter do conteúdo (dashboard) | 16 (`pt-2 px-4 pb-4`) | — |
| Faixa do topo | h 28, itens h 24: sino 24×24 com badge 8, chip usuário (avatar 24 iniciais + nome 13/500 + dot online 6 verde + chevron 12) | ±4 |
| Header card | h **70**, radius 12, px 12 py 12; tile 40×40 radius 10 `bg-[hsl(220_74%_21%)]` (ref `#0e285d`) ícone `TrendingUp` 20 branco; título/subtítulo à direita (gap 12); controles à direita h **34** radius 8 gap 10: chip período 167w · select filas 135w · select agentes 158w · refresh 38w | ±4 / ±2 |
| Tab pill | h **32**, radius 8, px 12, gap 6 (ícone 14 + label 13); ativa `bg-primary text-white`; inativa `bg-card/40 border border-border/50 text-foreground-secondary hover:bg-muted/60` | ±2 |
| Banner | h **73**, radius 12, `bg-card-elevated border-border/70`, px 16; avatar 44; divisores `w-px h-9 bg-border`; tile nível 34×34 radius 8 `bg-primary` (texto "12" 14/700 branco); barra h 6 w 180 radius full; chips h **30** radius 8 px 12 | ±4 / ±2 |
| KPI card | h **95**, radius 12, p 12; tile 34×34 radius 8 em (12,9); coluna de texto a x+58; barras à direita: 8 barras w 3 gap 3 radius 1, área 55×28 na base direita | ±4 / ±2 |
| Card de seção | radius 12, `bg-card border-border/70`, p 14; header: tile **44** (linhas 2–3) / **34** (linha 4) radius 10 `bg-kpi-blue`, título 15/700 + subtítulo 12 empilhados à direita (gap 10); ação à direita | ±2 |
| "Ver todas →" | h **26**, px 10, radius 8, `bg-muted/40 border-border/60`, `ArrowRight` 12 | ±2 |
| Select de card | h 28, radius 8, `bg-input/60 border-border/60`, chevron 12 | ±2 |
| Chip de status (Ao vivo/Tempo real/Ativo) | h 22, px 8, radius 6, dot 6 | ±2 |
| Gráfico Volume | plot 160 de altura (y 400–560), y-axis 5 ticks, x-axis 6 ticks (00:00…20:00), legenda h 16 no rodapé | ±8 |
| "Agora" | 4 linhas h 44 (tile 36 radius 8 + valor/label), gap 0 | ±4 |
| Donut | 100×100, stroke 8, gap 10 para a coluna de checklist; checklist 4 itens h 30 radius 8 gap 6, checkbox 16 radius 4 | ±4 |
| Tabela filas | header h 22, linhas h **31**, colunas: Fila · Aguardando · Em atendimento · Tempo médio · SLA · Status; badge h **22** px 8 radius 6 | ±3 |
| Atividade | 4 linhas h **41**: avatar 30 + nome/ação + tempo + dot 8 | ±3 |
| Equipe | 4 linhas h **41**: medalha 24 (🥇🥈🥉 via `Medal`/`Trophy` lucide com `--dash-amber-fg`, prata `text-muted-foreground`, bronze `hsl(18 38% 40%)`; 4º = número) · avatar 28 · nome + "N resolvidas" · barra h 6 w 120 · "98% SLA" | ±3 |
| IA mini-tile | 4 colunas, h **100**, radius 10, p 10; tile 34; título; descrição | ±6 |
| CSAT | esquerda: nota 30px + 5 estrelas 12 + delta; direita: 5 linhas h 20 gap 2 (rótulo 20w + barra h 10 radius 5 flex-1 + pct 32w) | ±3 |
| Sentimento | legenda 3 itens (dot 8 + label) + gráfico 100 de altura, 3 séries com área 15% | ±8 |
| FAB de microfone | existente (global) — não tocar | — |

### 2.5 Layout (wireframe da área de conteúdo, 1317w na referência)
```
┌16                                                          🔔•  (AO) Admin 01 ▾ ┐ h28
│ ┌[↗] Dashboard                          [📅 Hoje ▾][Todas as filas ▾][Todos os agentes ▾][↻]┐ h70
│ └    Visão geral do atendimento em tempo real                                              ┘
│ [⊙ Visão Geral][↗ Analytics][◎ Metas][⚙ Inteligência Artificial][◷ Métricas SLA][♟ Equipe][♡ Satisfação][☺ Sentimento][▤ Relatórios] h32
│ ┌(AO) Boa noite, Admin! 👋   │ [12] Nível 12 ▬▬▬▬▬░░ 63%  │ [⚡1.250 XP][⭐ 89][🔥 7] │ Disciplina hoje,      ┐ h73
│ └     Aqui está o resumo…    │      1.250 / 2.000 XP      │                        │ resultados amanhã.    ┘
│ ┌KPI 95┐ ┌KPI 95┐ ┌KPI 95┐ ┌KPI 95┐ ┌KPI 95┐                                                          5 cols
│ ┌Volume de Atendimentos ─────────── [Últimas 24h▾]┐ ┌Agora ───── ● Ao vivo┐ ┌Metas do Dia ─ [Ver todas →]┐ h259
│ │ 40┤    ╭──╮  tooltip                          │ │ [18] Conversas ativas │ │  ◔ 2/4   ☑ Responder 10…    │
│ │ 20┤ ───╯   ╰────╌╌╌╌ previsão                  │ │ [6] Aguardando        │ │    50%   ☑ Resolver 5…      │
│ │  0┴00:00 04:00 08:00 12:00 16:00 20:00         │ │ [3] SLA violado hoje  │ │ Continue ☐ Tempo médio…    │
│ │ ─ Conversas reais  ╌ Previsão IA               │ │ [▮] Fila maior volume │ │ assim!   ☐ Sem pendências…  │
│ └────────────────────────────────────────────────┘ └──────────────────────┘ └────────────────────────────┘
│ ┌Saúde das Filas [Tempo real]   [Ver todas →]┐ ┌Atividade Recente [Ver todas →]┐ ┌Equipe em Destaque [Hoje ▾]┐ h220
│ │ Fila  Aguard. Em atend. T.médio SLA Status│ │ (JS) João Silva      há 2 min •│ │ 🥇 (av) Nome ▬▬▬▬ 98% SLA │
│ │ Comercial 8  12  2m15s 92% [Bom]          │ │ (MC) Maria Costa     há 5 min •│ │ 🥈 (av) Nome ▬▬   92% SLA │
│ └───────────────────────────────────────────┘ └────────────────────────────────┘ └────────────────────────────┘
│ ┌Inteligência Artificial [● Ativo] [Ver todas →]┐ ┌Satisfação (CSAT) [Últimos 30 dias▾]┐ ┌Tendência de Sentimento [14 dias▾]┐ h173
│ │ [tile][tile][tile][tile]                      │ │ 4.8 ★★★★★  5★ ▬▬▬▬▬ 72%             │ │ ● Positivo ● Neutro ● Negativo    │
│ └───────────────────────────────────────────────┘ └─────────────────────────────────────┘ └───────────────────────────────────┘
│ ▸ Gamificação & IA Stats (colapsado; preserva Desafios, Ranking, Conquistas, Mini-games, IA Stats)        (fora da referência)
└16
```

### 2.6 Motion (efeitos React — uma orquestração, não confete)
- **Entrada da página (1×):** KPI valores count-up 600ms (`useMotionValue` + `animate`, ou `AnimatedCounter` existente se aceitar `duration` e formatação pt-BR); barras dos KPIs `scaleY` 0→1 400ms; `Area`/`Line` do Volume com `isAnimationActive` do recharts (700ms) — sem `pathLength` manual; arco do donut `strokeDashoffset` 600ms; barras de progresso (nível, equipe, CSAT) `width` 0→valor 500ms; cards fade 150ms **sem stagger** (máx 12 itens, `delay: Math.min(i,12)*0.02`).
- **Tabs:** pill ativa desliza com `layoutId="dashboard-tab-pill"` (spring 400/32) dentro de `LayoutGroup id="dashboard-tabs"`.
- **Hover de card:** `hover:border-primary/40 hover:-translate-y-0.5`, sombra `0 8px 24px -8px hsl(var(--primary)/.35)`, 150ms. Sem `scale`.
- **Chips de status:** dot com pulso suave (scale 1→1.6 opacity .6→0, 2s, `repeat: Infinity`) **apenas** no dot de "Ao vivo" quando `isConnected` — indicador de estado, permitido pelo §39.
- **Botões:** `whileTap={{ scale: 0.98 }}` em refresh, "Ver todas", tabs.
- **Troca de tab:** `AnimatePresence mode="wait"` fade 120ms.
- **Skeleton:** `animate-shimmer` já existe; shapes com as mesmas alturas (70/32/73/95/259/220/173).
- **Proibido:** Aurora, FloatingParticles, ParallaxContainer, `blur` de entrada, `neon-underline`, `glow-gradient-pulse`, `whileHover scale` em métricas, stagger em tabelas/listas, animação infinita fora do dot.
- Tudo respeita `useReducedMotion()` → duração 0.

---

## 3. CONTRATO DE DADOS (cada elemento da referência → fonte real → comportamento sem dado)

| Elemento da referência | Fonte real | Sem dado |
|---|---|---|
| Faixa do topo: sino, usuário | `open-command-palette` (igual Contatos); `useAuth().profile.name` + `getInitials`; dot online = `profile.is_active` | — |
| Header: título/subtítulo | copy fixa "Dashboard" / "Visão geral do atendimento em tempo real" (UI, não dado) | — |
| Filtros: período/fila/agente/refresh | `DashboardFilters` atual (`DashboardFiltersState`, `getDefaultFilters`, `PERIOD_OPTIONS`, calendário) — só apresentação muda | — |
| Saudação | `hour` + `profile.name` (lógica atual) | "Boa noite! 👋" |
| Nível, XP, barra, "1.250 / 2.000 XP", % | `useAgentGamification().stats.{level, xp}` + `xpForNextLevel(level)` + `levelProgress(xp, level)` | cluster inteiro **oculto** (banner mantém saudação + frase) |
| Chip ⚡ XP · ⭐ · 🔥 | `stats.xp` · `stats.achievements_count` (rótulo "conquistas") · `stats.current_streak` | ocultos com o cluster |
| Frase motivacional | array de 7 frases (copy) escolhida por `dayOfYear % 7` — **copy de UI, não dado** | — |
| KPI 1 Conversas Abertas | `stats.openConversations` · barras = `metricsHistory.slice(-8).map(m => m.activeConversations)` · delta: **omitido** (sem histórico) → "—" muted | valor 0 |
| KPI 2 Não Lidas | `useRealtimeDashboard().unreadMessages` · barras **omitidas** · delta **omitido** | valor 0 |
| KPI 3 Tempo Médio de Resposta | `useDashboardKpi().avgResponseToday` (conversation_sla hoje) · delta vs ontem (menor = melhor → seta ↓ verde) · barras = média por hora hoje (8 buckets de 3h) | "—" |
| KPI 4 Atendentes Online | `stats.onlineAgents / stats.totalAgents` · linha 2 = `● N% online` · barras **omitidas** | 0 / 0 |
| KPI 5 Resolvidas Hoje | `useDashboardKpi().resolvedToday` (`conversation_closures` hoje) · delta vs ontem · barras = fechamentos por hora hoje (8 buckets) | 0 |
| Volume: "Conversas reais" | `useTodayHourlyVolume()` (`messages` hoje por hora) | eixos + empty state compacto no centro |
| Volume: "Previsão IA" | `useDemandPrediction().data.filter(isPrediction)` (horas futuras) | linha omitida + legenda sem o item |
| Volume: "Capacidade máxima" | **não existe fonte** (`35` hardcoded no hook) → **omitido**, registrar | — |
| Volume: tooltip "Agora · N conversas · X% acima da média" | N = hora atual de `useTodayHourlyVolume`; média = `useDemandPrediction().data[hora].predicted` (média 7 dias) → `%` derivado | só "N conversas" |
| Volume: select | `Hoje (por hora)` \| `Últimos 7 dias (por dia)` — ambos derivados da mesma query de `messages` (7 dias) | — |
| Agora › Conversas ativas | `activeConversationsNow` | 0 |
| Agora › Aguardando atendimento | `stats.pendingConversations` | 0 |
| Agora › "Em risco de SLA" | **preferir** contagem "em risco" se `useSLACalculation`/`useApplicableSLA` a expuser sem query nova; **senão** `useDashboardKpi().slaBreachedToday` (`first_response_breached = true` hoje) com rótulo **"SLA violado hoje"** — o rótulo segue o dado | 0 |
| Agora › Fila com maior volume | `argmax` sobre `useQueueHealth().rows` por (aguardando + em atendimento) → "Nome (N)" | "—" |
| Agora › chip "Ao vivo" | `useRealtimeDashboard().isConnected` (offline → chip cinza "Offline") | — |
| Metas do Dia: donut, "2/4", checklist | `useGoalsDashboard()` com `period === 'today'`: `completedGoals/goals.length`, itens = `goals` (check se `current >= target`) | **fallback**: dados do `ChallengesWidget` (4 desafios com progresso real de `stats`) e título **"Desafios do Dia"**; 0 metas e 0 stats → empty compacto "Configurar metas" → `GoalsConfigDialog` |
| Metas: "Continue assim! / Você está no caminho certo." | derivado de `overallProgress` (≥50% "Continue assim!", <50% "Vamos acelerar", 100% "Metas concluídas!") | — |
| Metas: "Ver todas →" | `setActiveTab('goals')` | — |
| Saúde das Filas (tabela) | `useQueueHealth()`: `queues` ativas × `contacts` do dia (aguardando = `queue_id` sem `assigned_to`; em atendimento = com `assigned_to`) × `conversation_sla` hoje (join por `contact_id` → tempo médio e `SLA %`); Status: ≥95 Excelente · ≥85 Bom · <85 Atenção (limiares de UI, documentados) | linha "Sem filas ativas" |
| Saúde: chip "Tempo real" | `isConnected` | — |
| Saúde: "Ver todas →" | `setActiveTab('sla')` | — |
| Atividade Recente | `useRecentConversationEvents(4)`: `conversation_events` desc + nomes (`contacts.name`, `profiles.name`); texto por `event_type`: `assign`→"Assumiu conversa com {contato}", `unassign`→"Liberou conversa", `transfer`→"Transferiu para {agente}", `queue_transfer`→"Transferiu para {fila}", `overload_reassign`/`absence_reassign`→"Reatribuição automática"; avatar = iniciais de `performed_by` (`getAvatarColor`); tempo = `formatDistanceToNow` pt-BR | "Sem atividade hoje" compacto |
| Atividade: "Ver todas →" | `navigateToView('audit-logs')` (existe no `ViewRouter`) | — |
| Equipe em Destaque | `useLeaderboard().agents.slice(0,4)` (ordem por xp) · "N resolvidas" = `agent_stats.conversations_resolved` (expor no hook) · "% SLA" = `useSLAMetrics('today').byAgent[agentId].overallRate` · barra = SLA% (≥95 `--dash-green-fg`, senão `--primary`) · select "Hoje/Semana/Mês" = `useLeaderboard().timeRange` existente | "Sem dados de equipe" |
| IA: 4 mini-tiles | `AIQuickAccess` features com ids de Sugestões, Análise de Conversa, Alertas de Sentimento, Transcrição (exportar `AI_FEATURES` do arquivo); clique = mesmo `handleFeatureClick` | — |
| IA: chip "Ativo" | se `useAIStats`/`useAIUsageDashboard` expuser provedor ativo → chip; senão **omitido** | — |
| IA: "Ver todas →" | `setActiveTab('ai')` (as 6 features) | — |
| CSAT | `useCSAT(period)`: `average`, `distribution`, `trend`; estrelas = `Math.round(average)`; select `Hoje`/`Esta semana`/`Últimos 30 dias` = `'today'|'week'|'month'` | `total === 0` → "Sem avaliações no período" compacto |
| Sentimento | `useSentimentData(period).dailyData` (usar o mesmo shape que `SentimentTrendChart` já consome); select = opções que o componente atual já oferece (default 14 dias) | empty compacto |
| Linha 5 (fora da referência) | `DashboardSectionHeader` "Gamificação & IA Stats" colapsado com `ChallengesWidget`, `Leaderboard`, `DemoAchievements`, `TrainingMiniGames`, `AIStatsWidget` (via `DashboardWidgetRenderer` para os widgets `level === 3` + `challenges`) | — |

---

## 4. ARQUITETURA DA MUDANÇA

### 4.1 Alterados (diff cirúrgico salvo onde indicado)
| Arquivo | Mudança |
|---|---|
| `src/styles/tokens.css` | **só acrescentar** no fim do `:root`: tokens `--dash-*` e `--foreground-secondary` (Apêndice A) |
| `tailwind.config.ts` | `theme.extend.colors.dash.{tile-blue,tile-red,tile-green,tile-violet,tile-amber,blue,red,green,violet,amber,yellow}` + `foreground-secondary` |
| `src/components/layout/ViewContainer.tsx` | prop `compactGutter?: boolean` (default `false` = markup idêntico); `true` → `pt-2 px-4 pb-4` |
| `src/pages/ViewRouter.tsx` | `const COMPACT_GUTTER_VIEWS = new Set(['dashboard'])` + `compactGutter={COMPACT_GUTTER_VIEWS.has(currentView)}` |
| `src/components/dashboard/DashboardView.tsx` | **reescrita autorizada**: shell de 5 blocos + linha 5; tabs controladas; sem efeitos |
| `src/components/dashboard/DashboardFilters.tsx` | **reescrita da apresentação autorizada**: chip de período (2 linhas) + selects h-34 + refresh; estado/props/`getDefaultFilters`/`PERIOD_OPTIONS` intactos |
| `src/components/dashboard/RealtimeMetricsPanel.tsx` | deixa de ser usado na Visão Geral (arquivo mantido) |
| `src/components/dashboard/AIQuickAccess.tsx` | exportar `AI_FEATURES` e `handleFeatureClick` reutilizáveis (sem mudar o render da tab `ai`) |
| `src/hooks/gamification/useLeaderboard.ts` | expor `conversationsResolved` (já vem de `agent_stats.conversations_resolved`) |
| `src/hooks/analytics/useDashboardData.ts` | expor `contacts` crus (já carregados) para `useQueueHealth`; nada mais |
| `src/components/dashboard/DashboardSectionHeader.tsx` | só se precisar de variante `compact` (default inalterado) |

### 4.2 Novos
| Arquivo | Conteúdo |
|---|---|
| `src/hooks/dashboard/useDashboardKpi.ts` | `conversation_closures` + `conversation_sla` (hoje/ontem, buckets por hora) → deltas e séries; `aggregateDashboardKpi()` pura + teste |
| `src/hooks/dashboard/useQueueHealth.ts` | filas × contacts × conversation_sla → linhas da tabela + fila com maior volume |
| `src/hooks/dashboard/useRecentConversationEvents.ts` | `conversation_events` (limit 4) + resolução de nomes |
| `src/hooks/dashboard/useTodayHourlyVolume.ts` | `messages` (7 dias) → série de hoje por hora + série por dia |
| `src/components/dashboard/overview/DashboardTopBar.tsx` | sino + chip de usuário |
| `src/components/dashboard/overview/DashboardHeader.tsx` | card do header (tile, título, subtítulo, slot de filtros) |
| `src/components/dashboard/overview/DashboardTabs.tsx` | 9 pills com `layoutId` (Radix `Tabs` mantido por acessibilidade) |
| `src/components/dashboard/overview/GreetingBanner.tsx` | saudação + gamificação real + frase |
| `src/components/dashboard/overview/DashboardKpiCard.tsx` + `DashboardKpiRow.tsx` | 5 KPIs; `KpiBars` (barras) |
| `src/components/dashboard/overview/DashboardCard.tsx` | card de seção: `SectionHeader` (tile 44/34, título, subtítulo, ação), `VerTodasButton`, `StatusChip`, `CardSelect` |
| `src/components/dashboard/overview/VolumeChart.tsx` · `NowPanel.tsx` · `DailyGoalsCard.tsx` | linha 2 |
| `src/components/dashboard/overview/QueueHealthTable.tsx` · `RecentActivityCard.tsx` · `TeamHighlightCard.tsx` | linha 3 |
| `src/components/dashboard/overview/AIToolsCard.tsx` · `CsatCard.tsx` · `SentimentTrendCard.tsx` | linha 4 |
| `src/components/dashboard/overview/GamificationSection.tsx` | linha 5 (preservação) |
| `src/components/dashboard/overview/OverviewSkeleton.tsx` | shapes com as alturas reais |
| `src/components/dashboard/__tests__/*.test.tsx`, `src/hooks/dashboard/__tests__/*.test.ts` | agregações e cards com hooks mockados |
| `docs/design/REDESIGN_DASHBOARD_STATUS.md` | ledger (Apêndice F) |
| `/workspace/qa-dashboard/*` | scripts E.1–E.5 (cópia adaptada de `/workspace/qa`) |

### 4.3 Não tocar
`supabase/`, `types.ts`, `sidebarNavConfig.ts`, `AppShell`, `Sidebar*.tsx`, `PageHeader.tsx`, `src/components/contacts/**`, bloco `.dark` de `tokens.css`, `presets.ts`, `vite.config.ts`, `eslint.config.js`, telas fora do dashboard (exceto `ViewRouter`/`ViewContainer` nas 2 linhas acima), testes fora de `dashboard`/`hooks/dashboard`/`hooks/analytics` (a não ser que quebrem por classe/texto — atualize o teste, nunca o comportamento).

---

## 5. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP12)
Filtros globais (período com calendário custom, fila, agente, refresh com spinner) · 9 tabs com os mesmos `value` (`overview`, `analytics`, `goals`, `ai`, `sla`, `team`, `satisfaction`, `sentiment`, `reports`) · saudação por hora · gamificação (XP, nível, streak, conquistas — agora reais) · KPIs em tempo real (`useRealtimeDashboard` continua ligado, incluindo realtime channel) · Analytics (DemandPrediction, ConversationHeatmap, ActivityHeatmap) · Metas (GoalsDashboard + GoalsConfigDialog + celebração) · IA (6 features clicáveis + navegação) · SLA (SLAMetricsDashboard) · Equipe (AgentPerformancePanel) · Satisfação (SatisfactionMetrics + CSATDashboard movido para cá) · Sentimento (SentimentTrendChart) · Relatórios (ScheduledReportsManager) · Desafios do Dia · Ranking (Leaderboard) · Conquistas · Mini-games · IA Stats · empty/loading/error states · permissões · responsivo · atalhos existentes.

---

## 6. O PLANO — 100 ETAPAS · 12 FASES · 13 CHECKPOINTS
Formato: `[ ] N. Ação — arquivo — DoD`. Marque `[x]` **só** com evidência no ledger.

### FASE 0 — Preparação e diagnóstico (1–9) → CP0
- [ ] **1.** `cd /workspace/repos/Zapp_Web_V2 && git fetch origin && git worktree add /workspace/repos/Zapp_Web_V2-dashboard -b redesign/dashboard-navy-v1 origin/redesign/contatos-navy-v2`. Registre o SHA base. **Todas as etapas seguintes rodam dentro do worktree.** — DoD: `git worktree list` mostra os dois; `git branch --show-current` = `redesign/dashboard-navy-v1`.
- [ ] **2.** Trazer o plano de `origin/main`: `git checkout origin/main -- docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md`. Depois, para cada arquivo opcional, `git cat-file -e origin/main:docs/design/dashboard-reference.png && git checkout origin/main -- docs/design/dashboard-reference.png` (idem para `PROMPT_MESTRE_DASHBOARD_WIDE_24_FULLHD.md`). `git commit -m 'docs(dashboard): plano de execução (+ referência/prompt mestre se presentes)'`. Registre no ledger `E.4: habilitado|pulado (sem PNG no repo)`. — DoD: plano no worktree; se o PNG existir, `pngjs` confirma 1536×1024.
- [ ] **3.** `bun install --frozen-lockfile` no worktree (node_modules próprio; `df -h /workspace` antes e depois — disco em 85%, registre os GB). Se faltar espaço (< 5 GB livres), **pare** e registre "BLOQUEIO: disco". — DoD: `ls node_modules/.bin/vite` existe; GB no ledger.
- [ ] **4.** Ledger `docs/design/REDESIGN_DASHBOARD_STATUS.md` (Apêndice F). Commit `chore(dashboard): ledger`. — DoD: commitado.
- [ ] **5.** QA: `mkdir -p /workspace/qa-dashboard && cp /workspace/qa/shot.mjs /workspace/qa/measure.mjs /workspace/qa/colors.mjs /workspace/qa/package.json /workspace/qa-dashboard/ 2>/dev/null; cd /workspace/qa-dashboard && npm i playwright@1.56 pngjs pixelmatch && npx playwright install chromium`. Adaptar: URL `?view=dashboard`, porta 4174, viewports `1583x1024` (fidelidade: 1583 − 234 − 32 = 1317 = largura de conteúdo da referência) e `1920x1080` (primária), `localStorage.setItem('zapp-sidebar-collapsed','false')`, saída em `/workspace/qa-dashboard/out`. Se `docs/design/dashboard-reference.png` existir: `cp docs/design/dashboard-reference.png /workspace/qa-dashboard/ref.png`. — DoD: `node -e "require('playwright')"` ok; `ref.png` presente **ou** `E.4: pulado` no ledger.
- [ ] **6.** Credencial: `. /workspace/.local/env.sh && grep -E 'ZAPP_QA_(EMAIL|PASSWORD)' /workspace/.secrets/zapp-v2.env` (usuário `qa.visual@promobrindes.com.br`, supervisor, já existe). `curl` de login retorna `access_token`. — DoD: registrado.
- [ ] **7.** Baseline: `npm run typecheck && node scripts/ci/lint-ratchet.mjs && node scripts/ci/typecheck-ratchet.mjs && npm run implicit-any-check && npx vitest run src/components/dashboard src/hooks/analytics src/hooks/dashboard`. Tudo verde antes de mexer (a base já corrigiu o implicit-any). — DoD: 5 exits 0 no ledger.
- [ ] **8.** Screenshot "ANTES" de **produção**: `node shot.mjs https://zapp-web-v2.vercel.app out/00-before-1583.png dark 1583 1024` e `out/00-before-1920.png` (1920×1080), vista `?view=dashboard`, tab overview. — DoD: 2 arquivos.
- [ ] **9.** Auditoria rápida no código real (confirmar seção 1): `grep -n "value=\"1.250\"\|currentXP={1250}" src/components/dashboard/DashboardView.tsx`; `grep -n "currentCapacity = 35" src/hooks/business/useDemandPrediction.ts`; `grep -rn "capacity\|max_concurrent" src/integrations/supabase/types.ts | wc -l` (= 0); `grep -n "waitingCount: 0\|recentActivity: \[\]" src/hooks/analytics/useDashboardData.ts`; `grep -rn "WidgetConfigSheet\|DraggableWidgetContainer" src --include=*.tsx -l` (só os próprios). Anote qualquer divergência. — DoD: bloco "Divergências" iniciado.

**CP0 — Ambiente.** Gate: 1–9 com evidência, `00-before-*.png` existentes, worktree isolado, porta 4174 livre (`ss -ltn | grep 4174` vazio).

### FASE 1 — Fundação: tokens, gutter compacto, remoção de efeitos, shell (10–19) → CP1
- [ ] **10.** `tokens.css` `:root` (fim do bloco, **depois** das linhas `--kpi-tile-*`/`--page-glow` da base): tokens do Apêndice A. — DoD: `grep -c "dash-tile-\|dash-.*-fg\|foreground-secondary" src/styles/tokens.css` ≥ 12; `git diff src/styles/tokens.css` só adiciona linhas.
- [ ] **11.** `tailwind.config.ts`: `dash` + `foreground-secondary` em `theme.extend.colors`. — DoD: `bg-dash-tile-blue`, `text-dash-green`, `text-foreground-secondary` compilam sem warning.
- [ ] **12.** `ViewContainer.tsx`: prop `compactGutter` (default `false`); com `true`, o scroller usa `pt-2 px-4 pb-4` em vez de `p-[var(--layout-gutter)]`. — DoD: snapshot/markup de qualquer outra view inalterado (`git diff` só na branch `compactGutter`).
- [ ] **13.** `ViewRouter.tsx`: `COMPACT_GUTTER_VIEWS = new Set(['dashboard'])` e a prop. — DoD: no dashboard, `getComputedStyle(scroller).paddingLeft === '16px'`; em `?view=contacts`, `36px`.
- [ ] **14.** `DashboardView.tsx`: remover `AuroraBorealis`, `FloatingParticles`, `ParallaxContainer`, os `motion.div` com `blur`/`rotate`/`neon-underline`/`glow-gradient-pulse`, `AnimatedBadge`/`LevelProgress` hardcoded. Manter `useDashboardData`, `useAuth`, `DashboardFilters`, `Tabs` (agora **controladas**: `const [tab, setTab] = useState('overview')`), os 9 `TabsContent` e todo o conteúdo das 8 tabs secundárias **intacto**. — DoD: `grep -n "Aurora\|Particles\|Parallax\|blur(\|neon\|glow-gradient" src/components/dashboard/DashboardView.tsx` = 0; as 9 tabs renderizam.
- [ ] **15.** Shell da Visão Geral em `DashboardView.tsx` (`TabsContent value="overview"`): `div.space-y-2.5` com placeholders vazios na ordem `DashboardTopBar → DashboardHeader → DashboardTabs → GreetingBanner → DashboardKpiRow → row2 → row3 → row4 → GamificationSection` (cada um um `div` com `data-testid` e a altura-alvo por `min-h-*` temporário, para o CP1 medir o ritmo vertical). O `RealtimeMetricsPanel` e o `ProgressiveDisclosureDashboard` deixam de ser renderizados **aqui** (widgets level 3 + challenges voltam na Fase 9). — DoD: `data-testid="dash-topbar|dash-header|dash-tabs|dash-banner|dash-kpis|dash-row2|dash-row3|dash-row4|dash-gamification"` presentes; ordem correta.
- [ ] **16.** `OverviewSkeleton.tsx`: shapes 28/70/32/73/95/259/220/173 com `animate-shimmer`; usado quando `isLoading || !stats`. — DoD: sem CLS (alturas iguais aos blocos reais).
- [ ] **17.** Grep de cores hardcoded no módulo: `grep -rnE "hsl\(240|#[0-9a-f]{6}\b|rgb\(" src/components/dashboard/DashboardView.tsx src/components/dashboard/DashboardFilters.tsx` → trocar por token. — DoD: 0 ocorrências nos dois arquivos.
- [ ] **18.** `npm run build && npx vite preview --port 4174 --strictPort &` (background, PID em `/workspace/logs/redesign-dashboard-preview.pid`). — DoD: `curl -sI http://localhost:4174 | head -1` = 200.
- [ ] **19.** Gates + commit `redesign(dashboard): fase 1 — tokens dash, gutter compacto, shell sem efeitos` + `git push --no-verify origin redesign/dashboard-navy-v1`. — DoD: push ok (`git ls-remote origin redesign/dashboard-navy-v1` = HEAD).

**CP1 — Fundação.** Gate: E.1 (`01-after-1583.png`) + E.2 → `gutterLeft=16`, `sidebar=234`, `scrollW ≤ innerW` a 1583 e 1920; E.3 → amostra de fundo e card = tokens (ΔE ≤ 2 vs token; registrar ΔE vs referência como informativo). Ritmo vertical dos placeholders: tops de cada bloco ±6 dos alvos (36, 116, 156, 237, 343, 611, 841 na coordenada do shot = referência +3).

### FASE 2 — Faixa do topo + header card + filtros (20–27) → CP2
- [ ] **20.** `DashboardTopBar.tsx`: `div.h-7.flex.items-center.justify-end.gap-3`; sino 24×24 (`Bell` 16, `aria-label="Notificações"`, `onClick → open-command-palette`, badge 8px `bg-dash-red` só se `unreadMessages > 0`); chip usuário (`button.h-6.gap-2`: avatar 24 iniciais `getAvatarColor`, nome 13/500, dot 6 `bg-success` se `profile.is_active`, `ChevronDown` 12) que abre o mesmo popover/menu de perfil da sidebar se existir (`grep -rn "AgentProfilePopover" src/components/layout`) — senão navega para `settings`. — DoD: 3 elementos funcionam; a referência mostra 2 sinos (artefato da IA) → 1 sino, registrar.
- [ ] **21.** `DashboardHeader.tsx`: `div.h-[70px].rounded-xl.bg-card.border.border-border/70.px-3.flex.items-center.gap-3`; tile 40 `rounded-[10px] bg-[hsl(220_74%_21%)]` + `TrendingUp` 20 `text-white`; `h1` "Dashboard" `text-2xl font-bold tracking-[-0.02em] leading-none`; `p` "Visão geral do atendimento em tempo real" `text-[13px] text-foreground-secondary mt-1`; `ml-auto` slot `{filters}`. — DoD: E.2 `headerCard=70±4`, `headerTile=40±2`, `title=24px`.
- [ ] **22.** `DashboardFilters.tsx` (apresentação): trigger de período = `button.h-[34px].w-[167px].rounded-lg.bg-input.border-border.px-3.flex.items-center.gap-2` com `CalendarIcon` 16 e duas linhas (label do período 12/600 + intervalo formatado `EEE, dd 'de' MMM 'de' yyyy` 11 muted); abre `Popover` com os `PERIOD_OPTIONS` (lista) e, quando `custom`, o `Calendar` de range já existente. Estado e handlers **inalterados**. — DoD: 5 períodos funcionam; custom abre calendário; "Sex, 06 de set de 2026" formato pt-BR.
- [ ] **23.** Selects de fila e agente: `SelectTrigger className="h-[34px] rounded-lg bg-input border-border text-[13px] font-medium"` com larguras 135/158 (`w-[135px]`, `w-[158px]`); `SelectContent` inalterado. — DoD: h 34±2.
- [ ] **24.** Refresh: `button.h-[34px].w-[38px].rounded-lg.bg-primary/25.border.border-primary/40.text-primary` + `RefreshCw` 16 (`animate-spin` quando `isRefreshing`); `whileTap` 0.98. — DoD: h 34, ΔE ≤ 8 vs `#133470`.
- [ ] **25.** Responsivo do header: `< xl` → filtros quebram em linha própria abaixo (`flex-wrap`), header vira `min-h-[70px] h-auto`; `< md` → chip de período `w-full`. — DoD: 1280 e 390 sem overflow.
- [ ] **26.** Handler de refresh: além de `refetch()` do `useDashboardData`, `queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })`, `['queue-health']`, `['recent-conversation-events']`, `['today-hourly-volume']` (chaves das Fases 5–7 — deixar preparado). — DoD: código presente.
- [ ] **27.** Gates + commit `redesign(dashboard): fase 2 — top bar, header card 70px, filtros 34px` + push `--no-verify`. — DoD: remoto = HEAD.

**CP2 — Header.** Gate: E.2 → `topBar=28±4`, `headerCard=70±4`, `headerTile=40±2`, `periodChip=167x34±4`, `queueSelect=135x34`, `agentSelect=158x34`, `refresh=38x34`, `title=24±1`; E.3 → refresh ≤ 8. Screenshot `02-after-1583.png`.

### FASE 3 — Tabs pill (28–32) → CP3
- [ ] **28.** `DashboardTabs.tsx`: extrair o `<TabsList>`/`<TabsTrigger>` de `DashboardView` (mesmos 9 `value`, mesmos ícones lucide: `TrendingUp, BarChart3, Target, Brain, Clock, Award, Heart, Smile, FileText` — na referência o 1º ícone é um alvo/círculo; manter os atuais, registrar). `TabsList` sem fundo/borda, `flex gap-1.5 h-8 bg-transparent p-0`, `overflow-x-auto snap-x` abaixo de 1440. — DoD: comportamento idêntico (roving tabindex, setas).
- [ ] **29.** `TabsTrigger`: `relative h-8 px-3 rounded-lg text-[13px] font-medium gap-1.5 text-foreground-secondary bg-card/40 border border-border/50 hover:bg-muted/60 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:border-transparent`; ícone 14. Sem `shadow-sm`/`bg-background` do shadcn (sobrescrever via `className`, não editar `ui/tabs.tsx`). — DoD: pill h 32±2.
- [ ] **30.** Pill deslizante: `<motion.span layoutId="dashboard-tab-pill" className="absolute inset-0 rounded-lg bg-primary -z-10" transition={{type:'spring',stiffness:400,damping:32}}/>` quando ativo; `LayoutGroup id="dashboard-tabs"`; reduced-motion → `span` estático. — DoD: anima; sem flicker.
- [ ] **31.** Uma linha em 1920 e 1583: `[...tabs].every(t => t.offsetTop === tabs[0].offsetTop)`; largura total ≤ 1317 em 1583 (referência termina em x=1341, i.e., 1135 de largura). — DoD: assert OK nos dois viewports.
- [ ] **32.** Gates + commit `redesign(dashboard): fase 3 — tabs pill 32px com layoutId` + push `--no-verify`.

**CP3 — Tabs.** Gate: E.2 → `tabPill=32±2`, `tabsOneLine=true` (1583 e 1920), `tabActiveWidth≈139±12`. E.3 → tab ativa = `--primary`. Screenshot `03-after-1583.png`.

### FASE 4 — Banner de saudação + gamificação real (33–40) → CP4
- [ ] **33.** `GreetingBanner.tsx`: `div.h-[73px].rounded-xl.bg-card-elevated.border.border-border/70.px-4.flex.items-center.gap-4`; avatar 44 (`getInitials`/`getAvatarColor`, `avatar_url` se existir); título `text-xl font-bold` = `{greeting}` (lógica atual movida de `DashboardView`); sub `text-[12px] text-foreground-secondary` "Aqui está o resumo da sua operação hoje.". — DoD: h 73±4; nome real.
- [ ] **34.** Cluster de nível: `useAgentGamification()`; se `stats` existir: tile 34 `bg-primary rounded-lg` com `level` 14/700 branco; "Nível {level}" 13/600; barra `h-1.5 w-[180px] rounded-full bg-muted/60` com `motion.div` `width: levelProgress(xp, level)%` (`bg-primary`, 500ms); linha "{xp} / {xpForNextLevel(level)} XP" 11 muted + `{pct}%` 11/600 à direita. Se `stats` for `null` → não renderiza o cluster nem os chips (registrar quantos usuários têm `agent_stats`: `select count(*) from agent_stats` via MCP **read-only**, só para o ledger). — DoD: números batem com `agent_stats` do usuário de QA (`select xp, level, current_streak, achievements_count from agent_stats where profile_id = …`).
- [ ] **35.** Chips: `⚡ {xp.toLocaleString('pt-BR')} XP` (`bg-[hsl(224_85%_29%)] text-[hsl(217_100%_80%)]`), `⭐ {achievements_count}` (`bg-dash-tile-amber text-dash-amber`, `title="Conquistas"`), `🔥 {current_streak}` (`bg-[hsl(354_48%_23%)] text-dash-red`, `title="Dias seguidos"`); ícones lucide `Zap`/`Star`/`Flame` 14 (a referência usa emoji — usar lucide, registrar); `h-[30px] px-3 rounded-lg text-[12px] font-semibold gap-1.5`. — DoD: 3 chips h 30±2, ΔE ≤ 8 vs `#0b2d87`, `#624910`, `#561e24`.
- [ ] **36.** Divisores `w-px h-9 bg-border/80` entre saudação | nível | chips | frase. Frase: `MOTIVATION_PHRASES[dayOfYear % 7]` (7 frases curtas em pt-BR, tom sóbrio, ex.: "Disciplina hoje, resultados amanhã."), `text-[12px] text-foreground-secondary max-w-[220px] leading-snug`. — DoD: frase muda por dia (teste com `vi.setSystemTime`).
- [ ] **37.** Responsivo: `< xl` → frase oculta; `< lg` → chips quebram; `< md` → cluster de nível abaixo da saudação (`h-auto min-h-[73px]`). — DoD: 1280/1024/390 sem overflow.
- [ ] **38.** Remover de `DashboardView.tsx` a saudação antiga e imports de `GamificationEffects` (arquivo mantido; `grep -rn "AnimatedBadge\|LevelProgress" src --include=*.tsx -l` para confirmar quem mais usa — se ninguém, registrar como sem uso). — DoD: 0 hardcoded no dashboard (`grep -n "1.250\|1250\|requiredXP={2000}" src/components/dashboard/DashboardView.tsx` = 0).
- [ ] **39.** Teste `GreetingBanner.test.tsx`: com stats → 3 chips e barra; sem stats → só saudação + frase. — DoD: verde.
- [ ] **40.** Gates + commit `redesign(dashboard): fase 4 — banner de saudação com gamificação real` + push `--no-verify`.

**CP4 — Banner.** Gate: E.2 → `banner=73±4`, `levelTile=34±2`, `chips=30±2`, `avatar=44±2`; valores = `agent_stats` (assert no E.5 via query read-only). Screenshot `04-after-1583.png`.

### FASE 5 — KPIs com dados reais (41–50) → CP5
- [ ] **41.** `useDashboardKpi.ts` (Apêndice B.1): queries `conversation_closures` (desde ontem 00:00) e `conversation_sla` (desde ontem 00:00, `first_response_at not null` + `first_response_breached`) → `aggregateDashboardKpi(rows, now)` pura: `resolvedToday`, `resolvedYesterday`, `deltaResolvedPct`, `resolvedHourly8[]`, `avgResponseToday` (s), `avgResponseYesterday`, `deltaResponsePct`, `responseHourly8[]`, `slaBreachedToday`. `staleTime: 60_000`. — DoD: hook tipado sem `any`; teste com 30 linhas sintéticas e `now` fixo.
- [ ] **42.** `DashboardKpiCard.tsx`: props `{ label, value: string, delta?: { pct: number, invert?: boolean, label?: string } | { text: string, tone: 'success'|'muted' } | null, tile: 'blue'|'red'|'green', icon, bars?: number[] | null, barsColor: 'blue'|'red'|'green'|'violet', testid }`. Layout: `h-[95px] rounded-xl bg-card border border-border/70 p-3 flex gap-3`; tile 34 `rounded-lg bg-dash-tile-{tile}` + ícone 18 `text-white/90`; coluna: label 12/500 secondary; valor 22/700 `tabular-nums` com `CountUp`; linha delta: `TrendingUp/Down` 12 + `{±pct}%` 11/600 (`invert` inverte a semântica de cor) + "vs. ontem" 11 muted; `delta === null` → "—" muted (sem seta). `KpiBars`: 8 barras `w-[3px] gap-[3px] rounded-[1px]` altura proporcional (mín 15%), cor `bg-dash-{barsColor}`, `motion.div scaleY` 0→1 400ms; `bars === null` → `div` vazio da mesma largura (55×28). — DoD: 3 variantes de delta e 2 de barras cobertas por teste.
- [ ] **43.** `DashboardKpiRow.tsx`: `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5`; cards: 1 Conversas Abertas (`MessageSquare`, blue, `stats.openConversations`, delta null, bars = `metricsHistory.slice(-8).map(m=>m.activeConversations)`, blue) · 2 Não Lidas (`Mail`, red, `unreadMessages`, delta null, bars null, red) · 3 Tempo Médio de Resposta (`Clock`, green, `formatResponseTime(avgResponseToday)` no formato `2m 41s`, delta `{pct: deltaResponsePct, invert: true}`, bars `responseHourly8`, green) · 4 Atendentes Online (`Users`, green, `${online}/${total}`, delta `{text: '● ${pct}% online', tone:'success'}`, bars null, **violet**) · 5 Resolvidas Hoje (`CheckCircle2`, green, `resolvedToday`, delta `{pct: deltaResolvedPct}`, bars `resolvedHourly8`, green). — DoD: 5 cards 95±4, `data-testid="kpi-card"`/`kpi-tile`/`kpi-value`.
- [ ] **44.** `formatResponseTime` existente devolve `2min 41s` — criar `formatShortDuration(s)` → `2m 41s` / `41s` / `1h 05m` **no novo componente** (não alterar a função existente, usada em outros lugares). — DoD: teste.
- [ ] **45.** `CountUp`: `useMotionValue(0)` + `animate(…, {duration:.6})` + `useTransform` → `toLocaleString('pt-BR')`; para valores não numéricos (`8/10`, `2m 41s`) renderiza direto. `useReducedMotion` → direto. — DoD: "1.516"-style com ponto de milhar.
- [ ] **46.** Ligar `useRealtimeDashboard` no `DashboardView` (uma instância; passar para KPI e "Agora"). Não criar segunda subscription. — DoD: `grep -c "useRealtimeDashboard(" src/components/dashboard/overview src/components/dashboard/DashboardView.tsx` = 1.
- [ ] **47.** `resolvedToday` do KPI 5 vem de `conversation_closures`; registrar no ledger a diferença vs `stats.resolvedToday` (aproximação por `contacts.updated_at`) no dia do teste. — DoD: os dois números no ledger.
- [ ] **48.** Skeleton dos 5 KPIs enquanto qualquer hook carrega (h 95). — DoD: sem CLS.
- [ ] **49.** Testes: `DashboardKpiRow.test.tsx` com hooks mockados (valores, deltas, ausência de barras). — DoD: verde.
- [ ] **50.** Gates + commit `redesign(dashboard): fase 5 — 5 KPIs com dados reais (closures/sla), barras e deltas honestos` + push `--no-verify`.

**CP5 — KPIs.** Gate: E.2 → `kpiCards=[95,95,95,95,95]±4`, larguras iguais ±3, `kpiTile=34±2`, `kpiValueFont=22±1`; E.3 → tiles ≤ 8 (`#09328a`, `#7a1d2e`, `#0c5134`), barras KPI1 ≤ 8 (`#2694ff`). Screenshot `05-after-1583.png`.

### FASE 6 — Linha 2: Volume · Agora · Metas do Dia (51–61) → CP6
- [ ] **51.** `DashboardCard.tsx`: `DashboardCard({ children, className, testid })` = `section.rounded-xl.bg-card.border.border-border/70.p-3.5.flex.flex-col` + hover (2.6); `SectionHeader({ icon, title, subtitle?, tileSize: 44|34, right? })`; `VerTodasButton({ onClick })` (h 26); `StatusChip({ label, tone: 'success'|'muted', pulse? })` (h 22); `CardSelect` = `Select` shadcn com trigger `h-7 rounded-lg bg-input/60 border-border/60 text-[11px] font-medium`. — DoD: 4 primitives testadas; `data-testid="section-tile"`.
- [ ] **52.** Grid da linha 2 em `DashboardView`: `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5`, cards `min-h-[259px]`. — DoD: larguras 632/333/333 ±8 em 1583.
- [ ] **53.** `useTodayHourlyVolume.ts` (B.4): `messages.select('created_at').gte(now-7d)` (mesma janela do `useDemandPrediction`; `queryKey ['today-hourly-volume']`) → `todayByHour[24]` (só até a hora atual), `last7ByDay[7]`, `currentHour`, `currentHourCount`, `avg7dCurrentHour` (média dos 7 dias na mesma hora). — DoD: teste com timestamps sintéticos.
- [ ] **54.** `VolumeChart.tsx`: header tile 44 `BarChart3`, "Volume de Atendimentos" / "Comparativo de conversas ao longo do tempo"; `CardSelect` `Hoje (por hora)` \| `Últimos 7 dias (por dia)`; recharts `ComposedChart` h 160: `Area` (`dataKey="actual"`, stroke `hsl(var(--primary))` 2px, fill `url(#volumeFill)` gradiente `primary/.35 → 0`, `dot={false}`, `activeDot r=3`), `Line` (`dataKey="predicted"`, `strokeDasharray="4 4"`, stroke primary, só horas futuras — de `useDemandPrediction`), `XAxis` ticks `00:00,04:00,…,20:00` 11px muted, `YAxis` 5 ticks, `CartesianGrid` horizontal `stroke=hsl(var(--border)/.5)` dashed; **sem** linha de capacidade (registrar); legenda custom no rodapé (h 16): "— Conversas reais", "╌ Previsão IA" (item some se não houver previsão). — DoD: E.2 `volumePlot=160±8`; `grep -n "Capacidade" src/components/dashboard/overview/VolumeChart.tsx` = 0.
- [ ] **55.** Tooltip custom (`bg-popover border border-border rounded-lg px-3 py-2`): "Agora" 11 muted / `{count} conversas` 12/600 / `{pct}% acima|abaixo da média` 11 secondary (pct de `currentHourCount` vs `avg7dCurrentHour`; sem média → linha omitida); `Tooltip` do recharts com `cursor` linha dashed `border`. No mount, o tooltip **não** fica fixo (a referência mostra um tooltip estático — é ilustração; registrar). — DoD: hover mostra os 3 textos.
- [ ] **56.** `NowPanel.tsx` ("Agora"): header tile 44 `Activity`, "Agora" / "Situação em tempo real", `StatusChip` "Ao vivo" (`isConnected`, pulse) ou "Offline"; 4 linhas h 44: [tile 36 `dash-tile-blue` `MessageSquare`] `activeConversationsNow` 18/700 + "Conversas ativas"; [green `Clock`] `pendingConversations` + "Aguardando atendimento"; [red `AlertTriangle`] SLA (regra da seção 3 — rótulo segue o dado; valor e rótulo em `text-dash-red`); [violet `Users`] "Fila com maior volume" + `{nome} ({n})` 13/600. — DoD: 4 linhas 44±4; chip reflete `isConnected` (simular offline desligando a rede no Playwright → "Offline").
- [ ] **57.** `useQueueHealth.ts` (B.2): entrada `contacts` (de `useDashboardData`, expor) + `queues` + query `conversation_sla` hoje (`contact_id, first_message_at, first_response_at, first_response_breached`) → `rows[]{queueId, name, color, waiting, inService, avgResponse|null, slaRate|null, status: 'excelente'|'bom'|'atencao'|null}` + `busiestQueue`. — DoD: teste com 3 filas sintéticas.
- [ ] **58.** `DailyGoalsCard.tsx`: header tile 44 `Target` "Metas do Dia" + `VerTodasButton → setTab('goals')`; corpo `grid grid-cols-[100px_1fr] gap-2.5`: donut SVG 100 (`circle` track `stroke=hsl(var(--muted)/.4)` 8px + arco `stroke=hsl(var(--dash-green))` `strokeLinecap=round`, `motion` em `strokeDashoffset` 600ms), centro `{done}/{total}` 16/700 + `{pct}%` 12 secondary; abaixo do donut "Continue assim!" 12/600 + sub 11 (regra da seção 3); direita: lista `space-y-1.5` de até 4 itens `h-[30px] rounded-lg bg-muted/40 px-2.5 flex items-center gap-2` com checkbox 16 (`bg-dash-green` + `Check` 12 branco se concluída; senão `border border-border`) + label 11/500 (`truncate`). Fonte: `useGoalsDashboard()` (se `period !== 'today'`, chamar `setPeriod('today')` no mount **apenas nesta instância** — verificar se o hook tem estado interno; se for compartilhado por contexto, não alterar e usar o período atual, registrando). Fallback para desafios conforme seção 3 (título "Desafios do Dia"). — DoD: donut 100±4; itens 30±2; com 0 metas mostra os desafios; com 0 metas e 0 stats mostra "Configurar metas" que abre `GoalsConfigDialog`.
- [ ] **59.** `GoalsConfigDialog` renderizado uma vez no `DashboardView` (já existe na tab `goals` via `GoalsDashboard`) — reaproveitar abrindo pelo estado do hook (`setConfigDialogOpen`) se ele for compartilhado; senão a instância local do card. — DoD: dialog abre e salva.
- [ ] **60.** Testes: `VolumeChart` (render sem dados → empty compacto), `NowPanel` (offline), `DailyGoalsCard` (3 estados). — DoD: verde.
- [ ] **61.** Gates + commit `redesign(dashboard): fase 6 — volume por hora, painel Agora, metas do dia reais` + push `--no-verify`.

**CP6 — Linha 2.** Gate: E.2 → `row2=[259,259,259]±6`, larguras `[632,333,333]±8`, `sectionTile=44±2`, `volumePlot=160±8`, `donut=100±4`, `nowRows=44±4`; E.3 → tile violeta ≤ 8 (`#491d9f`), arco do donut ≤ 8 (`#08c97a`), tile Metas ≤ 8 (`#093287`). Screenshot `06-after-1583.png`.

### FASE 7 — Linha 3: Saúde das Filas · Atividade Recente · Equipe em Destaque (62–71) → CP7
- [ ] **62.** Grid `xl:grid-cols-[4fr_3fr_3fr] gap-2.5`, `min-h-[220px]`. — DoD: larguras 519/389/389 ±10.
- [ ] **63.** `QueueHealthTable.tsx`: header tile 44 `ListChecks`, "Saúde das Filas", `StatusChip` "Tempo real", `VerTodasButton → setTab('sla')`; `table.w-full.text-[12px]`: `thead` 11/500 muted h 22 (`Fila · Aguardando · Em atendimento · Tempo médio · SLA · Status`), `tbody` linhas h 31 `border-t border-border/40`, até 4 filas (ordem: maior volume primeiro), colunas alinhadas à esquerda exceto Status; badge `h-[22px] px-2 rounded-md text-[11px] font-semibold`: `excelente`/`bom` → `bg-dash-tile-green text-dash-green`, `atencao` → `bg-dash-tile-amber text-dash-amber`, `null` → "—". Tempo médio `formatShortDuration`; SLA `{rate}%` (`null` → "—"). — DoD: E.2 `tableRow=31±3`, `statusBadge=22±2`; dados = `useQueueHealth`.
- [ ] **64.** `useRecentConversationEvents.ts` (B.3): `conversation_events.select('id, event_type, created_at, contact_id, performed_by, to_agent_id, to_queue_id').order('created_at',{ascending:false}).limit(4)`; depois `contacts.select('id,name').in('id', ids)` e `profiles.select('id,name,avatar_url').in('id', ids)`, `queues.select('id,name').in('id', ids)` (tentar primeiro o embed `contacts(name)` numa query única; se a FK não existir, usar os 3 selects — registrar qual funcionou). Mapeamento de texto da seção 3. `staleTime 30_000`; invalidado no refresh. — DoD: teste do mapeamento de `event_type`.
- [ ] **65.** `RecentActivityCard.tsx`: header tile 44 `History`, "Atividade Recente", `VerTodasButton → navigateToView('audit-logs')`; 4 linhas h 41 `flex items-center gap-2.5`: avatar 30 iniciais do executor (`getAvatarColor`), nome 12/600 + texto 11 secondary, `ml-auto` `há {distance}` 11 muted + dot 8 `bg-dash-blue`. Empty: "Sem atividade hoje". — DoD: 4 linhas 41±3.
- [ ] **66.** `useLeaderboard.ts`: adicionar `conversationsResolved: stat.conversations_resolved` no objeto (campo já vem do `select('*')` — confirmar; se o select for explícito, acrescentar a coluna). — DoD: tipo `LeaderboardAgent` ganha o campo; `Leaderboard.tsx` existente inalterado.
- [ ] **67.** `TeamHighlightCard.tsx`: header tile 44 `Trophy`, "Equipe em Destaque", `CardSelect` `Hoje|Semana|Mês` ligado a `timeRange/setTimeRange` do `useLeaderboard`; 4 linhas h 41: posição (1–3 = `Medal` 20 nas cores da seção 2.4; 4 = número 12/600 muted), avatar 28 (`avatar_url` ou iniciais), nome 12/600 `truncate` + `{conversationsResolved} resolvidas` 11 secondary, barra `h-1.5 w-[120px] rounded-full bg-muted/60` com `motion.div` `width: slaRate%` (`bg-dash-green` se ≥95, senão `bg-primary`), `{slaRate}% SLA` 11/600 `w-14 text-right` (`byAgent` de `useSLAMetrics('today')`; sem SLA → "—"). — DoD: 4 linhas 41±3; ordem = xp desc.
- [ ] **68.** `useSLAMetrics('today')` chamado uma vez no `DashboardView` e passado para Equipe e Agora (se a regra de SLA usar `breached`). — DoD: `grep -c "useSLAMetrics(" src/components/dashboard/overview src/components/dashboard/DashboardView.tsx` = 1.
- [ ] **69.** Responsivo: `< xl` → 2 colunas (tabela full width na 1ª linha); `< md` → 1 coluna; a tabela ganha `overflow-x-auto` interno abaixo de 640. — DoD: sem overflow global.
- [ ] **70.** Testes dos 3 cards com hooks mockados (incl. empty states). — DoD: verde.
- [ ] **71.** Gates + commit `redesign(dashboard): fase 7 — saúde das filas, atividade real (conversation_events), equipe em destaque` + push `--no-verify`.

**CP7 — Linha 3.** Gate: E.2 → `row3=[220,220,220]±6`, larguras ±10, `tableRow=31±3`, `statusBadge=22±2`, `activityRow=41±3`, `teamRow=41±3`, `verTodas=26±2`; E.3 → badge Bom ≤ 8 (`#0c4532`), Atenção ≤ 8 (`#72530b`) se houver fila nesse estado, barra SLA verde ≤ 8. Screenshot `07-after-1583.png`.

### FASE 8 — Linha 4: IA · CSAT · Sentimento (72–80) → CP8
- [ ] **72.** Grid `xl:grid-cols-[4fr_3fr_3fr] gap-2.5`, `min-h-[173px]`; `SectionHeader tileSize={34}` nos 3. — DoD: tiles 34±2.
- [ ] **73.** `AIQuickAccess.tsx`: exportar `AI_FEATURES` (array atual) e `useAIFeatureNavigation()` (encapsula `navigate`/`navigateToView` do `handleFeatureClick`) **sem alterar o JSX da tab `ai`**. — DoD: tab `ai` idêntica (snapshot).
- [ ] **74.** `AIToolsCard.tsx`: header tile 34 `Brain`, "Inteligência Artificial", `StatusChip` "Ativo" (regra da seção 3; senão omitido), `VerTodasButton → setTab('ai')`; `grid grid-cols-2 md:grid-cols-4 gap-2`: 4 mini-tiles (`button.h-[100px].rounded-[10px].bg-muted/30.border.border-border/60.p-2.5.text-left.flex.flex-col.gap-2`) para as features `suggestions|analysis|sentiment-alerts|transcription` (ids reais do array — se os ids forem outros, mapear pelos títulos exatos "Sugestões de Resposta", "Análise de Conversa", "Alertas de Sentimento", "Transcrição de Áudio"): tile 34 (amber `Sparkles` / blue `FileSearch` / red `AlertOctagon` / green `Mic`), título 12/600, descrição 11 secondary `line-clamp-2` (usar a `description` real de cada feature). — DoD: 4 tiles clicáveis navegam como na tab `ai`.
- [ ] **75.** `CsatCard.tsx`: header tile 34 `Smile`, "Satisfação do Cliente (CSAT)", `CardSelect` `Hoje|Esta semana|Últimos 30 dias` → `useCSAT(period)` (default `'month'`); corpo `grid grid-cols-[96px_1fr] gap-3`: esquerda `average.toFixed(1)` 30/700 `tabular-nums`, 5 `Star` 12 (`fill` `text-dash-amber` até `Math.round(average)`, resto `text-muted-foreground/40`), `{trend>0?'+':''}{trend}%` 11/600 (`dash-green`/`dash-red`) + "vs. período anterior" 11 secondary; direita 5 linhas h 20 gap 0.5: `{n} ★` 11 muted `w-7`, barra `h-2.5 rounded-full bg-muted/60 flex-1` com `motion.div` `width: pct%` (5–4★ `bg-dash-green`, 3★ `bg-dash-yellow`, 2–1★ `bg-dash-red`), `{pct}%` 11/600 `w-8 text-right`. `total === 0` → "Sem avaliações no período" compacto. — DoD: distribuição soma 100% (±1 por arredondamento); ΔE barras ≤ 8.
- [ ] **76.** `SentimentTrendCard.tsx`: header tile 34 `TrendingUp`, "Tendência de Sentimento", `CardSelect` com as opções que `SentimentTrendChart` já usa (default 14 dias) → `useSentimentData(period)`; legenda h 16 (dots 8 `dash-green`/`primary`/`dash-red` + "Positivo/Neutro/Negativo" 11); `AreaChart` h 100 com 3 `Area` (`stroke` 2px, `fill` 15%, `dot={false}`), `YAxis` ticks `0%/50%/100%`, `XAxis` datas `dd/MM` 11px (5 ticks). Usar exatamente o shape de `dailyData` que o `SentimentTrendChart` consome (ler o arquivo antes). — DoD: 3 séries renderizam; empty compacto sem dados.
- [ ] **77.** Chips/selects/botões da linha 4 com as mesmas primitives da Fase 6 (sem classes novas). — DoD: `grep -c "VerTodasButton\|CardSelect\|StatusChip" src/components/dashboard/overview/*.tsx` ≥ 9.
- [ ] **78.** Responsivo: `< xl` → 2 colunas; `< md` → 1; IA mini-tiles 2×2. — DoD: 1280/390 ok.
- [ ] **79.** Testes dos 3 cards. — DoD: verde.
- [ ] **80.** Gates + commit `redesign(dashboard): fase 8 — IA (4 atalhos reais), CSAT, sentimento` + push `--no-verify`.

**CP8 — Linha 4.** Gate: E.2 → `row4=[173,173,173]±6`, `iaTile=100±6`, `csatBars=20±2`, `sectionTile34=34±2`; E.3 → tile amber ≤ 8 (`#6f530c`), estrelas ≤ 8 (`#f3bc11`), barra 5★ ≤ 8 (`#09cc74`), barra 3★ ≤ 8 (`#d0bf4f`). Screenshot `08-after-1583.png` + **`08-compare.png` (E.4, só se habilitado) — olhe para ele.**

### FASE 9 — Linha 5 (preservação) + outras 8 abas harmonizadas (81–86) → CP9
- [ ] **81.** `GamificationSection.tsx`: `DashboardSectionHeader` (`variant="secondary"`, `defaultOpen=false`, título "Gamificação & IA Stats", descrição "Desafios, ranking, conquistas, mini-games e estatísticas de IA") envolvendo `DashboardWidgetRenderer` para `challenges` + `level3Widgets` visíveis de `useDashboardWidgets()` (respeitando `visible`/`order` do localStorage). — DoD: os 5 widgets renderizam ao expandir; `Expandir/Recolher` funcionam.
- [ ] **82.** Registrar no ledger: `ProgressiveDisclosureDashboard.tsx`, `RealtimeMetricsPanel.tsx`, `FloatingParticles.tsx`, `WidgetConfigSheet.tsx`, `DraggableWidgetContainer.tsx`, `GamificationEffects.tsx` (se sem outro uso) ficaram **sem uso no dashboard** — arquivos mantidos. — DoD: lista no ledger com `grep -rn <nome> src -l` de cada um.
- [ ] **83.** Tab `ai`: remover `<CSATDashboard />`; tab `satisfaction`: `<SatisfactionMetrics />` + `<CSATDashboard />` (ordem: métricas, depois CSAT). — DoD: `CSATDashboard` renderiza em `satisfaction`; tab `ai` só IA.
- [ ] **84.** Harmonização mínima das 8 abas secundárias (só classes, sem mudar estrutura): `Card` → `rounded-xl border-border/70`; `CardHeader` com título 15/700; gaps `space-y-6` → `space-y-2.5`/`gap-2.5` **apenas no nível de `TabsContent`** (não dentro dos componentes); remover `motion` de entrada com `blur`/`scale` em `DemandPrediction`, `AgentPerformancePanel`, `SLAMetricsDashboard`, `GoalsDashboard` se existirem (grep). — DoD: 8 screenshots `09-<tab>-1583.png` sem overflow, sem cinza-violeta (E.3 fundo ≤ 2 vs token).
- [ ] **85.** Verificar que `?view=contacts`, `?view=inbox`, `?view=pipeline` continuam com gutter 36 e sem regressão (`compactGutter` só no dashboard). — DoD: 3 screenshots `09-regress-*.png`.
- [ ] **86.** Gates + commit `redesign(dashboard): fase 9 — seção de gamificação preservada, CSAT em Satisfação, abas harmonizadas` + push `--no-verify`.

**CP9 — Preservação.** Gate: 9 tabs renderizam; widgets level 3 + desafios acessíveis; 3 views externas intactas. Screenshots no ledger.

### FASE 10 — Motion e performance (87–90) → CP10
- [ ] **87.** Orquestração da seção 2.6: count-up, barras, arco, progressos, fade de cards (primeiro mount só — `useRef` flag; troca de filtro/refresh não re-anima), `AnimatePresence` na troca de tab, pulse do dot "Ao vivo". — DoD: código presente; `grep -rn "repeat: Infinity" src/components/dashboard/overview` = 1 (o dot).
- [ ] **88.** `useReducedMotion()` em todos os pontos; Playwright `emulateMedia({reducedMotion:'reduce'})` → `transitionDuration === '0s'` e `animationDuration === '0s'` nos cards, pill, dot. — DoD: assert no E.2.
- [ ] **89.** `grep -rn "animate-pulse\|animate-float\|glow-pulse\|whileHover={{ scale" src/components/dashboard/overview src/components/dashboard/DashboardView.tsx` = 0 (exceto skeleton shimmer). — DoD: 0.
- [ ] **90.** `npm run build`: chunk do dashboard vs. base — Δ ≤ 12 KB gzip (há componentes novos; se passar, justificar no ledger com os números de `dist/assets/*dashboard*`). Commit `redesign(dashboard): fase 10 — motion orquestrado e reduced-motion` + push `--no-verify`.

**CP10 — Motion.** Gate: reduced-motion durations = 0; bundle Δ no ledger.

### FASE 11 — QA visual automatizado (91–95) → CP11
- [ ] **91.** E.1 no preview 4174: `11-final-1583.png` (1583×1024) e `11-final-1920.png` (1920×1080), skin limpo, dark, tab overview, sidebar expandida. — DoD: 2 arquivos.
- [ ] **92.** E.2 completo nos dois viewports → todos `OK` (máx 3 iterações por FAIL; registrar cada uma). Em 1920: `tabsOneLine=true`, `kpiOneRow=true`, `row3Top ≤ 640`, `scrollW ≤ innerW`. — DoD: tabela no ledger.
- [ ] **93.** E.3 → tokens compartilhados = token (≤ 2); `--dash-*` ≤ 8 vs referência. — DoD: tabela no ledger (com o ΔE informativo de `background`/`sidebar` vs referência).
- [ ] **94.** (Só se E.4 habilitado na etapa 2; senão registre `pulado` e vá para 95.) E.4 → `11-compare.png` (referência à esquerda, shot 1583 à direita, recortados na área de conteúdo) + `11-heatmap.png`; `mismatchPct` por região (`topbar 0–33`, `header 33–103`, `tabs 103–150`, `banner 150–230`, `kpi 230–335`, `row2 335–605`, `row3 605–835`, `row4 835–1015`). Cada região ≤ 35% (conteúdo/fotos/números explicam o resto); acima disso, **explique por quê**. — DoD: 8 números.
- [ ] **95.** `11-1440.png` (1440×900: 5 KPIs ou 3+2 legíveis, linhas 2–4 em 3 colunas ou 2+1), `11-1366.png`, `11-mobile.png` (390×844: 1 coluna, tabs com scroll, tabela com overflow interno), `11-light.png` (modo claro intacto — só verificar contraste/bordas; os tokens `--dash-*` valem para os dois modos). — DoD: 4 screenshots, `scrollWidth ≤ innerWidth` em todos.

**CP11 — Fidelidade.** Gate: E.2 100%, E.3 100%, E.4 registrado (ou `pulado`), 4 viewports secundários ok.

### FASE 12 — QA funcional/técnico, PR e verificação (96–100) → CP12
- [ ] **96.** Gates completos: `npm run typecheck` · `lint-ratchet` · `typecheck-ratchet` · `implicit-any-check` · `npm run lint` · `npx vitest run` (suíte inteira) · `npm run build` · `node scripts/ci/bundle-budget.mjs` (se existir). — DoD: 8 exits 0.
- [ ] **97.** E.5 funcional no preview (20 checks): período `Ontem`/`Esta Semana`/`Personalizado` (calendário) · fila · agente · refresh (spinner + invalidação: KPI re-busca) · 9 tabs · "Ver todas" ×5 (goals, sla, audit-logs, ai, e o de Atividade) · clique nos 4 atalhos de IA · select do Volume · select do CSAT · select do Sentimento · select da Equipe · seção Gamificação expande/recolhe · GoalsConfigDialog abre · offline → chip "Offline" · console sem `error` · tab `satisfaction` mostra CSATDashboard · tab `ai` não mostra CSAT. — DoD: JSON `{ok, fail, consoleErrors}` no ledger com 20 `OK`.
- [ ] **98.** PR `redesign(dashboard): Navy Operational — Visão Geral fiel à referência (100 etapas)`. **Base do PR = `redesign/contatos-navy-v2`** enquanto o PR de Contatos não estiver mergeado (o GitHub re-aponta para `main` automaticamente quando a base for mergeada e apagada). Corpo = seção "Entrega" do ledger + `00-before-1583.png` vs `11-final-1583.png` vs `dashboard-reference.png` + `11-compare.png`. — DoD: URL + status dos checks.
- [ ] **99.** Pré-condição de merge: PR de Contatos mergeado em `main`. Se sim: `git fetch && git rebase origin/main` (resolver conflitos só em `tokens.css :root` e `ViewRouter` se houver — registrar), push `--force-with-lease --no-verify`, CI verde, **squash merge**. Se não: **pare aqui**, registre "AGUARDANDO merge de Contatos" e entregue o PR aberto. — DoD: SHA do merge ou bloqueio registrado.
- [ ] **100.** Produção: deployment da Vercel do SHA do merge `READY` + `target: production`; `node shot.mjs https://zapp-web-v2.vercel.app out/12-prod-1920.png dark 1920 1080` (`?view=dashboard`) + E.3 em produção. — DoD: screenshot + asserts OK. **Só então** escreva "concluído".

**CP12 — Entregue.** Gate: PR mergeado (ou bloqueio honesto), produção verificada, ledger com as 13 seções e "Pendências/resíduos" preenchidos.

---

## 7. CRITÉRIOS DE ACEITAÇÃO FINAIS
**Visual:** área de conteúdo com gutter 16; faixa 28 + header 70 + tabs 32 + banner 73 + KPIs 95 + linhas 259/220/173 com gap 10; grids `5` / `[1.9fr_1fr_1fr]` / `[4fr_3fr_3fr]`; tiles 34/40/44; paleta `--dash-*` ≤ 8 ΔE da referência; shell = tokens da base; Inter; nenhum efeito decorativo; primeira dobra em 1920×1080 mostra header, filtros, tabs, banner, KPIs, linha 2 inteira e o topo da linha 3.
**Dados:** zero número/nome/frase da referência no código (exceto copy de UI listada); gamificação de `agent_stats`; KPIs 3 e 5 de `conversation_sla`/`conversation_closures`; Atividade de `conversation_events`; Metas de `goals_configurations` (fallback desafios); capacidade máxima e deltas sem fonte **omitidos**.
**Funcional:** seção 5 integralmente verde; nada removido, só movido (CSAT → Satisfação; widgets level 3 → seção colapsada).
**Técnico:** typecheck 0, ratchets verdes, testes verdes, build ok, bundle ≤ +12 KB gz, reduced-motion respeitado, light mode intacto, 1440/1366/mobile sem overflow, outras views com gutter 36.
**Honestidade:** ledger com números e caminhos; resíduos listados (KPI 4 tile verde + barras violeta como na referência; ícone da tab 1; emojis → lucide; 2 sinos → 1; tooltip estático → hover; fotos → `avatar_url`/iniciais).

---

## APÊNDICE A — `tokens.css` `:root` (acrescentar no fim, após `--page-glow`)
```css
    /* Dashboard — Navy Operational (medido de docs/design/dashboard-reference.png) */
    --foreground-secondary: 215 30% 78%;
    --dash-tile-blue: 221 88% 29%;
    --dash-tile-red: 349 62% 30%;
    --dash-tile-green: 156 73% 18%;
    --dash-tile-violet: 260 69% 37%;
    --dash-tile-amber: 43 80% 24%;
    --dash-blue: 210 100% 57%;
    --dash-red: 357 94% 63%;
    --dash-green: 153 90% 42%;
    --dash-violet: 282 95% 66%;
    --dash-amber: 45 90% 51%;
    --dash-yellow: 52 58% 56%;
```
`tailwind.config.ts`:
```ts
'foreground-secondary': 'hsl(var(--foreground-secondary))',
dash: {
  'tile-blue': 'hsl(var(--dash-tile-blue))', 'tile-red': 'hsl(var(--dash-tile-red))',
  'tile-green': 'hsl(var(--dash-tile-green))', 'tile-violet': 'hsl(var(--dash-tile-violet))',
  'tile-amber': 'hsl(var(--dash-tile-amber))',
  blue: 'hsl(var(--dash-blue))', red: 'hsl(var(--dash-red))', green: 'hsl(var(--dash-green))',
  violet: 'hsl(var(--dash-violet))', amber: 'hsl(var(--dash-amber))', yellow: 'hsl(var(--dash-yellow))',
},
```

## APÊNDICE B — Hooks novos (esqueletos)

### B.1 `src/hooks/dashboard/useDashboardKpi.ts`
```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';

type ClosureRow = { created_at: string };
type SlaRow = { first_message_at: string; first_response_at: string | null; first_response_breached: boolean | null };
const H = 3_600_000;

export function aggregateDashboardKpi(closures: ClosureRow[], sla: SlaRow[], now = new Date()) {
  const t0 = startOfDay(now).getTime(), y0 = startOfDay(subDays(now, 1)).getTime();
  const isToday = (iso: string) => Date.parse(iso) >= t0;
  const isYesterday = (iso: string) => { const t = Date.parse(iso); return t >= y0 && t < t0; };
  const pct = (cur: number, prev: number) => prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
  const bucket8 = (times: number[], weight?: number[]) => {
    const sum = Array(8).fill(0), cnt = Array(8).fill(0);
    times.forEach((t, i) => { const b = Math.min(7, Math.floor((t - t0) / (3 * H))); sum[b] += weight ? weight[i] : 1; cnt[b] += 1; });
    return weight ? sum.map((s, i) => cnt[i] ? s / cnt[i] : 0) : sum;
  };
  const cT = closures.filter(r => isToday(r.created_at)), cY = closures.filter(r => isYesterday(r.created_at));
  const answered = sla.filter(r => r.first_response_at);
  const rt = (r: SlaRow) => (Date.parse(r.first_response_at!) - Date.parse(r.first_message_at)) / 1000;
  const aT = answered.filter(r => isToday(r.first_message_at)), aY = answered.filter(r => isYesterday(r.first_message_at));
  const avg = (rows: SlaRow[]) => rows.length ? Math.round(rows.reduce((a, r) => a + rt(r), 0) / rows.length) : null;
  const avgT = avg(aT), avgY = avg(aY);
  return {
    resolvedToday: cT.length, resolvedYesterday: cY.length, deltaResolvedPct: pct(cT.length, cY.length),
    resolvedHourly8: bucket8(cT.map(r => Date.parse(r.created_at))),
    avgResponseToday: avgT, avgResponseYesterday: avgY,
    deltaResponsePct: avgT !== null && avgY !== null ? pct(avgT, avgY) : null,
    responseHourly8: bucket8(aT.map(r => Date.parse(r.first_message_at)), aT.map(rt)),
    slaBreachedToday: sla.filter(r => isToday(r.first_message_at) && r.first_response_breached === true).length,
  };
}

export function useDashboardKpi() {
  return useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const since = startOfDay(subDays(new Date(), 1)).toISOString();
      const [c, s] = await Promise.all([
        supabase.from('conversation_closures').select('created_at').gte('created_at', since),
        supabase.from('conversation_sla').select('first_message_at, first_response_at, first_response_breached').gte('first_message_at', since),
      ]);
      if (c.error) throw c.error; if (s.error) throw s.error;
      return aggregateDashboardKpi((c.data ?? []) as ClosureRow[], (s.data ?? []) as SlaRow[]);
    },
    staleTime: 60_000,
  });
}
```
Teste obrigatório: 30 linhas sintéticas (15 hoje, 10 ontem, 5 anteontem), `now` fixo às 15:00; asserts em todos os campos. A série `responseHourly8` para o KPI 3 é invertida visualmente (barras menores = melhor) — documentar no componente.

### B.2 `useQueueHealth(contacts, queues)` — entrada: `contacts` de `useDashboardData` (`id, queue_id, assigned_to`), `queues` (`id, name, color`); query `conversation_sla` de hoje (`contact_id, first_message_at, first_response_at, first_response_breached`), `queryKey ['queue-health']`. Por fila: `waiting`, `inService`, `avgResponse` (média dos contatos da fila com resposta hoje), `slaRate` (onTime/total, `null` se total 0), `status` (≥95 `excelente`, ≥85 `bom`, senão `atencao`; `null` sem dado); ordena por `waiting + inService` desc; `busiestQueue`.

### B.3 `useRecentConversationEvents(limit = 4)` — `queryKey ['recent-conversation-events', limit]`, `staleTime 30_000`; tentar `select('id, event_type, created_at, contact_id, performed_by, to_agent_id, to_queue_id, contacts(name)')`; em erro de relação, cair para os selects por ids. Retorna `items[]{id, actorName, actorAvatarUrl, text, createdAt}`.

### B.4 `useTodayHourlyVolume()` — `queryKey ['today-hourly-volume']`, `staleTime 60_000`; `messages.select('created_at').gte('created_at', now-7d)`; devolve `todayByHour: (number|null)[24]` (`null` para horas futuras), `last7ByDay[7]{date, count}`, `currentHour`, `currentHourCount`, `avg7dCurrentHour` (média da mesma hora nos 7 dias anteriores, excluindo hoje).

## APÊNDICE C — Contratos de componente
- `DashboardCard` / `SectionHeader({ icon, title, subtitle, tileSize, right })` / `VerTodasButton({ onClick, label = 'Ver todas' })` / `StatusChip({ label, tone, pulse })` / `CardSelect({ value, onValueChange, options, width })` — todos com `data-testid` (`dash-card`, `section-tile`, `ver-todas`, `status-chip`, `card-select`).
- `DashboardKpiCard` (Fase 5) com `data-testid="kpi-card"`, filhos `kpi-tile`, `kpi-value`, `kpi-bars`.
- Todos os textos em pt-BR, números `toLocaleString('pt-BR')`, datas `date-fns/locale/ptBR`.

## APÊNDICE D — Grid e responsividade (Tailwind)
```
KPIs:   grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5
Linha2: grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5   (lg: Volume ocupa as 2 colunas)
Linha3: grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5     (md: tabela ocupa as 2 colunas)
Linha4: grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5     (md: IA ocupa as 2 colunas)
Tabs:   overflow-x-auto snap-x abaixo de xl; uma linha em ≥ 1440
Header: flex-wrap abaixo de xl
```

## APÊNDICE E — Scripts de QA (`/workspace/qa-dashboard`, fora do repo)

### E.1 `shot.mjs` — igual ao de Contatos com: `url + '/?view=dashboard'`, `waitForSelector('[data-testid="dash-header"]')`, `localStorage.setItem('zapp-sidebar-collapsed','false')`, `localStorage.removeItem('theme-custom-colors')`, `localStorage.setItem('theme','dark')`, viewport por argumento (`1583 1024` fidelidade · `1920 1080` primária · `1440 900` · `1366 768` · `390 844`), saída em `out/`, console errors em `.console.json`.

### E.2 `measure.mjs` — no mesmo contexto, após render:
```js
const m = await page.evaluate(() => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const r = el => el ? el.getBoundingClientRect() : null, fs = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  const tabs = qa('[role="tab"]'); const kpis = qa('[data-testid="kpi-card"]');
  const scroller = q('[data-testid="dash-topbar"]')?.closest('.overflow-y-auto');
  return {
    sidebar: r(q('#main-navigation'))?.width, gutterLeft: scroller ? parseFloat(getComputedStyle(scroller).paddingLeft) : null,
    topBar: r(q('[data-testid="dash-topbar"]'))?.height, headerCard: r(q('[data-testid="dash-header"]'))?.height,
    headerTile: r(q('[data-testid="dash-header"] [data-testid="header-tile"]'))?.width, title: fs(q('[data-testid="dash-header"] h1')),
    periodChip: r(q('[data-testid="filter-period"]')), queueSelect: r(q('[data-testid="filter-queue"]')), agentSelect: r(q('[data-testid="filter-agent"]')), refresh: r(q('[data-testid="filter-refresh"]')),
    tabPill: r(tabs[0])?.height, tabActiveWidth: r(q('[role="tab"][data-state="active"]'))?.width, tabsOneLine: tabs.every(t => t.offsetTop === tabs[0].offsetTop),
    banner: r(q('[data-testid="dash-banner"]'))?.height, avatar: r(q('[data-testid="banner-avatar"]'))?.width, levelTile: r(q('[data-testid="level-tile"]'))?.width, chips: qa('[data-testid="gami-chip"]').map(e => r(e).height),
    kpiCards: kpis.map(e => Math.round(r(e).height)), kpiWidths: kpis.map(e => Math.round(r(e).width)), kpiOneRow: kpis.every(k => k.offsetTop === kpis[0].offsetTop),
    kpiTile: r(q('[data-testid="kpi-tile"]'))?.width, kpiValueFont: fs(q('[data-testid="kpi-value"]')),
    row2: qa('[data-testid="dash-row2"] > *').map(e => Math.round(r(e).height)), row2W: qa('[data-testid="dash-row2"] > *').map(e => Math.round(r(e).width)),
    row3: qa('[data-testid="dash-row3"] > *').map(e => Math.round(r(e).height)), row3W: qa('[data-testid="dash-row3"] > *').map(e => Math.round(r(e).width)),
    row4: qa('[data-testid="dash-row4"] > *').map(e => Math.round(r(e).height)),
    row3Top: r(q('[data-testid="dash-row3"]'))?.top,
    sectionTile44: r(q('[data-testid="dash-row2"] [data-testid="section-tile"]'))?.width, sectionTile34: r(q('[data-testid="dash-row4"] [data-testid="section-tile"]'))?.width,
    verTodas: r(q('[data-testid="ver-todas"]'))?.height, volumePlot: r(q('[data-testid="volume-plot"]'))?.height, donut: r(q('[data-testid="goals-donut"]'))?.width,
    nowRows: qa('[data-testid="now-row"]').map(e => Math.round(r(e).height)), tableRow: r(q('[data-testid="queue-row"]'))?.height, statusBadge: r(q('[data-testid="queue-status"]'))?.height,
    activityRow: r(q('[data-testid="activity-row"]'))?.height, teamRow: r(q('[data-testid="team-row"]'))?.height, iaTile: r(q('[data-testid="ai-tile"]'))?.height, csatBars: r(q('[data-testid="csat-row"]'))?.height,
    fontInter: document.fonts.check('16px Inter'), scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
  };
});
```
Asserts (alvo ± tol): `sidebar 234±4 · gutterLeft 16 · topBar 28±4 · headerCard 70±4 · headerTile 40±2 · title 24±1 · periodChip 167×34±4 · queueSelect 135×34±4 · agentSelect 158×34±4 · refresh 38×34±2 · tabPill 32±2 · tabActiveWidth 139±12 · tabsOneLine true · banner 73±4 · avatar 44±2 · levelTile 34±2 · chips[*] 30±2 · kpiCards[*] 95±4 · kpiWidths iguais ±3 · kpiOneRow true (≥1440) · kpiTile 34±2 · kpiValueFont 22±1 · row2[*] 259±6 · row2W [632,333,333]±8 (a 1583) · row3[*] 220±6 · row3W [519,389,389]±10 · row4[*] 173±6 · row3Top ≤ 640 (a 1920) · sectionTile44 44±2 · sectionTile34 34±2 · verTodas 26±2 · volumePlot 160±8 · donut 100±4 · nowRows[*] 44±4 · tableRow 31±3 · statusBadge 22±2 · activityRow 41±3 · teamRow 41±3 · iaTile 100±6 · csatBars 20±2 · fontInter true · scrollW ≤ innerW`. Reduced-motion: `emulateMedia({reducedMotion:'reduce'})` → `transitionDuration`/`animationDuration` = `0s` em `[data-testid="dash-card"]`, pill, dot.

### E.3 `colors.mjs` — amostras (mediana 9×9). Coordenadas **da referência** (1536×1024); no shot 1583×1024 aplicar `x+44, y+3`. Tokens compartilhados: alvo = token (≤ 2), ΔE vs referência informativo. `--dash-*`: alvo = hex da referência (≤ 8).
`page (1000,334) → --background` · `headerCard (600,50) → --card` · `kpiCard (320,290) → --card` · `banner (560,213) → --card-elevated` · `tabActive (270,138) → --primary` · `levelTile (656,193) → --primary` · `refresh (1345,68) → #133470 ≤ 8` · `kpiTileBlue (235,260) → #09328a` · `kpiTileRed (485,260) → #7a1d2e` · `kpiTileGreen (745,258) → #0c5134` · `kpiBarsBlue (389,310) → #2694ff` · `sectionTile (237,369) → --kpi-tile-blue` · `agoraViolet (889,564) → #491d9f` · `metasTile (1225,367) → #093287` · `donutArc (1305,470) → #08c97a` · `badgeBom (655,703) → #0c4532` · `badgeAtencao (668,733) → #72530b (se houver fila em atenção; senão registrar "n/a")` · `iaAmber (246,913) → #6f530c` · `csatGreen (980,897) → #09cc74` · `csatYellow (920,940) → #d0bf4f` · `stars (767,957) → #f3bc11` · `subtitle (268,84) → #bac7dc (texto: mediana em região de texto pode cair no fundo — usar `getComputedStyle(el).color` do elemento em vez de pixel)`. Se um ponto cair em texto/borda, mova ±6px para região plana e registre.

### E.4 `compare.mjs` (opcional: exige `/workspace/qa-dashboard/ref.png`) — `ref.png` (1536×1024) recortado em `x 193..1536` vs shot 1583×1024 recortado em `x 234..1583`, ambos 1343×1024 (shot deslocado 3px para cima para alinhar o header). `pixelmatch({threshold: 0.18, includeAA: false})`; composite lado a lado + heatmap; `mismatchPct` por região (faixas y da etapa 94).

### E.5 `func.mjs` — 20 checks da etapa 97 com `fails.push(...)` e `console` acumulado; imprime JSON.

## APÊNDICE F — Template do ledger `docs/design/REDESIGN_DASHBOARD_STATUS.md`
```md
# Redesign Dashboard — Navy Operational — STATUS
Branch: redesign/dashboard-navy-v1 · Base: <sha de origin/redesign/contatos-navy-v2> · Worktree: /workspace/repos/Zapp_Web_V2-dashboard · Preview: vite preview :4174 · QA: /workspace/qa-dashboard · QA user: ok · Disco: <GB livres antes/depois do install>

## CP0 Ambiente        [ ] sha= · before=out/00-before-1583.png,00-before-1920.png · gates baseline: typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ vitest=_
## CP1 Fundação        [ ] sha= · shot=01-after-1583.png · gutter=_ sidebar=_ · tops dos blocos=_ · bg=ΔE_(token) card=ΔE_(token)
## CP2 Header          [ ] sha= · shot=02-after-1583.png · topBar=_ headerCard=_ tile=_ title=_ period=_ queue=_ agent=_ refresh=_ ΔE_
## CP3 Tabs            [ ] sha= · shot=03-after-1583.png · pill=_ activeW=_ oneLine@1583=_ @1920=_
## CP4 Banner          [ ] sha= · shot=04-after-1583.png · banner=_ avatar=_ levelTile=_ chips=_ · agent_stats(QA user)=xp:_ level:_ streak:_ achievements:_
## CP5 KPIs            [ ] sha= · shot=05-after-1583.png · kpi=[_,_,_,_,_] widths=_ tile=_ valueFont=_ · tiles ΔE=_ · resolvedToday(closures)=_ vs stats.resolvedToday=_
## CP6 Linha 2         [ ] sha= · shot=06-after-1583.png · row2=_ row2W=_ tile44=_ volumePlot=_ donut=_ nowRows=_ · ΔE violet=_ arco=_ · capacidade: omitida · SLA rótulo usado: _
## CP7 Linha 3         [ ] sha= · shot=07-after-1583.png · row3=_ row3W=_ tableRow=_ badge=_ activityRow=_ teamRow=_ verTodas=_ · events embed: sim|não
## CP8 Linha 4         [ ] sha= · shot=08-after-1583.png · compare=08-compare.png · row4=_ iaTile=_ csatBars=_ tile34=_ · ΔE amber=_ stars=_ csat5=_ csat3=_ · chip Ativo: fonte|omitido
## CP9 Preservação     [ ] sha= · shots=09-<9 tabs>.png,09-regress-{contacts,inbox,pipeline}.png · arquivos sem uso: _
## CP10 Motion         [ ] sha= · reduced-motion: durations=0 · bundle Δ=_ KB gz
## CP11 Fidelidade     [ ] final=11-final-1583.png,11-final-1920.png · geometria: N/N ok (1583) N/N ok (1920) · cores: N/N · mismatch%: topbar=_ header=_ tabs=_ banner=_ kpi=_ row2=_ row3=_ row4=_ · 1440/1366/mobile/light ok
## CP12 Entrega        [ ] PR=<url> (base=_) · CI=_ · contatos mergeado: sim|não · rebase=_ · merge=<sha> · prod=12-prod-1920.png · colors prod ok

## Divergências plano × código
-
## Iterações do loop visual (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Shell (fundo/sidebar/primary) = tokens da branch de Contatos; referência do dashboard é mais neutra (ΔE 8.2 no fundo, 7.6 na sidebar) — um app, uma paleta
- Sidebar 234px (referência: 193px) — decisão do shell compartilhado
- KPI 4: tile verde + barras violeta (como na referência)
- "Capacidade máxima" omitida (sem fonte); deltas de Conversas Abertas/Não Lidas omitidos; barras de Não Lidas/Atendentes omitidas
- Frase motivacional: copy de UI (7 frases), não dado
- Emojis da referência → ícones lucide; 2 sinos → 1; tooltip do gráfico só no hover; fotos = avatar_url/iniciais
- Ícone da tab "Visão Geral" mantido (TrendingUp)
```

## APÊNDICE G — DISPARO E WATCHDOG (para Joaquim, via Portainer → container `claude-code`)

Pré-requisitos já satisfeitos em 07/09: `/workspace/.local/env.sh` exporta `CLAUDE_CODE_OAUTH_TOKEN` (de `/run/secrets`) e `IS_SANDBOX=1`; `/workspace/qa` tem Playwright + Chromium; `qa.visual@` existe.

```sh
. /workspace/.local/env.sh && mkdir -p /workspace/logs && cd /workspace/repos/Zapp_Web_V2 && git fetch origin && \
cat > /workspace/logs/redesign-dashboard.prompt.txt <<'EOF'
Leia /workspace/repos/Zapp_Web_V2/docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md (em origin/main) por completo e execute-o do início ao fim, fase por fase, DENTRO do worktree /workspace/repos/Zapp_Web_V2-dashboard (crie-o na etapa 1; nunca edite /workspace/repos/Zapp_Web_V2). Feche cada checkpoint SOMENTE com a evidência exigida escrita em docs/design/REDESIGN_DASHBOARD_STATUS.md. REGRA PERMANENTE: todo push é `git push --no-verify origin redesign/dashboard-navy-v1` (o hook de pre-push trava a sessão). Preview na porta 4174, QA em /workspace/qa-dashboard. Não pule fases, não reordene, não afirme conclusão sem os arquivos de evidência. Se um gate falhar 3 vezes, registre o resíduo e siga. Se o PR de Contatos ainda não estiver mergeado na etapa 99, pare com o PR aberto e registre.
EOF
{ echo "=== START $(date -u +%FT%TZ) base=$(git rev-parse --short origin/redesign/contatos-navy-v2)"; } > /workspace/logs/redesign-dashboard.log
setsid nohup claude -p "$(cat /workspace/logs/redesign-dashboard.prompt.txt)" --model sonnet --dangerously-skip-permissions --verbose --output-format stream-json < /dev/null >> /workspace/logs/redesign-dashboard.log 2>&1 &
echo $! > /workspace/logs/redesign-dashboard-current.pid
```
Watchdog: copiar `/workspace/scripts/redesign-contatos-watchdog.sh` para `redesign-dashboard-watchdog.sh` trocando `REPO` (worktree), `LEDGER` (`REDESIGN_DASHBOARD_STATUS.md`), `CURPTR` (`redesign-dashboard-current.pid`), `WDLOG`, nomes de log e a branch no prompt de continuação; iniciar com `nohup … &` e PID em `redesign-dashboard-watchdog.pid`.
