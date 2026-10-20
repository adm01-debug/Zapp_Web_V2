# PLANO — REDESIGN DAS 7 ABAS RESTANTES DO DASHBOARD | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`)
> **Worktree:** `/workspace/repos/Zapp_Web_V2-dashboard` (NÃO tocar em `/workspace/repos/Zapp_Web_V2`, é outro worktree em uso)
> **Branch:** `redesign/dashboard-abas-navy` (base `origin/main` @ `3bf9a4e1`)
> **Ledger obrigatório:** `docs/design/REDESIGN_DASHBOARD_ABAS_STATUS.md`
> **Tela:** `https://zapp-web-v2.vercel.app/?view=dashboard`
> **Versão:** 1.0 — 07/09/2026

## 0. O QUE ESTE PLANO É

O redesign "Navy Operational" (PR #272, `81a0ff26`) reconstruiu **apenas a aba Visão Geral**.
As 7 abas restantes ainda renderizam os componentes antigos, em estilo shadcn genérico:

```
<TabsContent value="goals">        <GoalsDashboard />
<TabsContent value="ai">           <AIQuickAccess />
<TabsContent value="sla">          <SLAMetricsDashboard />
<TabsContent value="team">         <AgentPerformancePanel />
<TabsContent value="satisfaction"> <SatisfactionMetrics /> + <CSATDashboard />
<TabsContent value="sentiment">    <SentimentTrendChart />
<TabsContent value="reports">      <ScheduledReportsManager />
```

Esta entrega reconstrói essas 7 abas no mesmo design system da Visão Geral.

### 0.1 REGRA ZERO — "MANTENHA AS CORES"

**Nenhum token de cor, fonte, raio ou sombra muda.** Instrução literal do Joaquim.
- `src/styles/tokens.css` — **proibido editar**
- `tailwind.config.ts` (bloco de cores) — **proibido editar**
- `src/components/settings/theme/presets.ts` — **proibido editar**
- `index.html` — **proibido editar**
Se uma aba "pede" uma cor que não existe, use a mais próxima entre `--dash-tile-{blue,red,green,violet,amber}`,
`--dash-{blue,red,green,violet,amber,yellow}`, `--primary`, `--success`, `--warning`, `--destructive`.
Nunca escreva hex/rgb/hsl literal em componente. Sempre token.

### 0.2 Design system a reutilizar (já existe, já testado)

| Primitivo | Arquivo | Uso |
|---|---|---|
| `DashboardCard` | `overview/DashboardCard.tsx` | container padrão: `rounded-xl bg-card border-border/70 p-3.5`, hover + fade de entrada. **Todo card das abas usa este.** |
| `SectionHeader` | idem (export do mesmo arquivo) | tile 44 ou 34 + título 15/700 + subtítulo + slot `right` |
| `VerTodasButton` | idem, se existir | link "Ver todas →" |
| `DashboardKpiCard` | `overview/DashboardKpiCard.tsx` | card de KPI (label, value, delta, tile, icon, bars, barsColor). **Toda linha de KPI usa este.** |
| `DashboardTabs` | `overview/DashboardTabs.tsx` | pill segmentado com `layoutId` — referência para sub-tabs internas |
| `formatShortDuration` | `overview/formatShortDuration.ts` | durações "2m 41s" |

Ritmo/geometria herdados da Visão Geral: `gap-2.5` (10px) entre cards e linhas, `space-y-2.5` no `TabsContent`,
card `p-3.5`, tile de seção 44 (card principal) / 34 (card do rail), título de card 15/700, texto secundário 12-13 muted.
Grade de 2 colunas do corpo: `grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5`.
Linha de KPI: `grid grid-cols-2 xl:grid-cols-4 gap-2.5`.

### 0.3 Regras invioláveis

1. **Zero dado falso.** Nenhum nome ("João Silva", "Maria Almeida"), número ou série inventada no código.
   Se não houver fonte real para um bloco, renderize o **empty state honesto** (ícone + título + 1 linha) —
   nunca placeholder numérico. Registre no ledger todo bloco que caiu em empty state por falta de fonte.
2. **Zero backend.** Nada de migration, RLS, RPC, Edge Function. Só leitura pelos hooks que já existem.
3. **Zero regressão funcional.** Todo handler/estado existente em cada componente de aba continua ligado.
   Antes de reescrever um componente, liste no ledger o que ele faz hoje (props, handlers, dialogs, mutations).
4. **Reescrita autorizada apenas** nos componentes de aba listados na fase correspondente + arquivos novos em
   `src/components/dashboard/<aba>/`. `DashboardView.tsx` só muda o conteúdo dos `TabsContent`.
   Componentes compartilhados (`Card`, `Button`, `Badge`, `Tabs`, `DashboardCard`, `DashboardKpiCard`) só mudam
   por **prop/variante nova com default = comportamento atual**.
5. **A aba `analytics` NÃO faz parte desta entrega.** Não tocar.
6. **Shell não muda**: `DashboardTopBar`, `GreetingBanner`, `DashboardHeader`, `DashboardFilters`, `DashboardTabs`
   e a Visão Geral ficam exatamente como estão.
7. **Ratchets são gate.** Após cada fase: `npm run typecheck` (0 erros) · `node scripts/ci/lint-ratchet.mjs` ·
   `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npx vitest run src/components/dashboard`.
8. **Push sempre com `git push --no-verify`** (o hook pre-push trava a sessão).
9. **NUNCA `pkill -f` / `killall` com padrão genérico** (porta, node, vite, claude) — o argv desta sessão contém o
   prompt e o padrão mata a própria sessão. Só `kill <PID exato>` confirmado em `/proc`, ou `fuser -k <porta>/tcp`.
10. **Shell é `dash`**, sem `[[ ]]`, arrays, `source`. Sem `python3` — QA em Node.
11. **Um commit por fase**, mensagem `redesign(dash-abas): fase N — <aba>`. Push imediato ao fechar cada checkpoint.
12. **Máximo 3 iterações por loop visual.** Na 3ª, registre o resíduo no ledger e siga.
13. **Se o plano contradisser o código real, o código real vence** — registre a divergência no ledger antes de decidir.
14. **Nenhum checkpoint fecha sem evidência** (screenshot + saída de comando + SHA no ledger). "Feito" sem arquivo é mentira.

### 0.4 Fonte da verdade visual

Os mockups (7 PNGs, um por aba) **não estão no repo** — foram descritos em texto na seção de cada fase.
A descrição da fase **é** a especificação executável. Não invente elementos fora dela; não omita elementos dela.
Onde a descrição citar um dado sem fonte no código, aplique a regra 0.3.1 (empty state) e registre.

### 0.5 QA

Scripts já existem em `/workspace/qa-dashboard` (`shot.mjs`, `tabsShots.mjs`, `measure.mjs`, `colors.mjs`,
`e5-functional.mjs`, `reducedMotion.mjs`). Credenciais: `/workspace/.secrets/zapp-v2.env`
(`ZAPP_QA_EMAIL` / `ZAPP_QA_PASSWORD`). Preview local: `npx vite preview --port 4174 --strictPort` a partir
deste worktree, PID gravado em `/workspace/logs/redesign-abas-preview.pid`.
`shot.mjs` já tem o loop de dismiss dos overlays ("Bem-vindo" e OnboardingChecklist) — reutilize, não reescreva.
Screenshots em `/workspace/qa-dashboard/out/abas-*.png`.

---

## FASE 0 — Preparação (CP0)

1. Confirmar branch `redesign/dashboard-abas-navy` e HEAD; `npm ci` (ou `bun install --frozen-lockfile`).
2. Baseline verde dos 5 gates da regra 7. Registrar saídas no ledger.
3. Criar `docs/design/REDESIGN_DASHBOARD_ABAS_STATUS.md` (template no fim deste arquivo). Commit + push.
4. Subir preview local e capturar **ANTES** de cada uma das 7 abas:
   `out/abas-00-before-{goals,ai,sla,team,satisfaction,sentiment,reports}.png` (viewport 1583×900).
5. Ler, por aba, o componente atual e escrever no ledger a lista de funcionalidades que ele entrega hoje
   (regra 0.3.3). Essa lista é o contrato de não-regressão de cada fase.

**CP0** — 7 screenshots ANTES + 5 gates verdes + contrato por aba no ledger.

---

## FASE 1 — Metas (`goals`) → CP1

Arquivos: reescrita autorizada de `GoalsDashboard.tsx`; novos em `src/components/dashboard/goals/`.
Dados: `useGoalsDashboard` (`src/hooks/analytics/useGoalsDashboard.ts`), `useAgentGamification`, `useLeaderboard`.
Preservar: `GoalsConfigDialog` (botão "Configurar metas"), filtros por status, qualquer mutation existente.

Layout `grid xl:grid-cols-[2fr_1fr] gap-2.5`:

**Coluna principal**
- Linha de 4 `DashboardKpiCard`:
  1. **Progresso Geral** — valor `NN%` (média de progresso das metas ativas), tile `amber`, ícone `Trophy`,
     delta `+NN%`; abaixo do valor, barra de progresso (`h-1.5 rounded-full bg-muted` + fill `bg-primary`)
     e legenda `N de M metas em andamento` (12 muted).
  2. **Metas Concluídas** — valor N, sublegenda `de M metas`, tile `green`, ícone `CheckCircle2`, bars verde.
  3. **Em Andamento** — valor N, sublegenda `metas ativas`, tile `blue`, ícone `Clock`, bars azul.
  4. **Em Risco** — valor N, sublegenda `precisa de atenção`, tile `red`, ícone `AlertTriangle`, bars vermelho.
- Card **"Metas do dia"** (`SectionHeader` icon `Target` tile 44, subtítulo "Acompanhe o progresso das suas metas ativas",
  `right` = sub-tabs pill `Ativas (n) | Concluídas (n) | Todas (n)` no padrão de `DashboardTabs`, h-8).
  Tabela (`table-auto w-full text-[13px]`), cabeçalho 12/600 muted, linhas `h-12` separadas por `border-border/60`:
  `Meta` (tile 34 com ícone do tipo + nome 13/600 + subtítulo 11 muted) · `Tipo` (badge pill) ·
  `Progresso` (barra 130px + `NN%` à direita) · `Atual / Meta` · `Restante` ·
  `Status` (badge: Em dia = success, Atenção = warning, Em risco = destructive, Em andamento = primary) ·
  `Ações` (kebab `MoreHorizontal` 32×32 ghost com o menu atual, se existir).
  Sem metas → empty state (ícone `Target`, "Nenhuma meta ativa", botão que abre `GoalsConfigDialog`).

**Rail direito** (3 cards, tile 34)
- **"Seu nível e progresso"** + link `Ver ranking →` (navega para a aba `team`): tile hexagonal com ícone,
  `Nível N` 15/700, `X / Y XP` 12 muted, badge `NN%` à direita (`bg-primary/15 text-primary-glow`),
  barra de progresso full-width, e caixa `bg-primary/10 border-primary/30 rounded-lg p-2.5` com ícone raio +
  `Faltam N XP para o próximo nível!` + linha de apoio. Sem gamificação carregada → esconder o card inteiro.
- **"Ações rápidas"**: 4 linhas `h-10 rounded-lg hover:bg-muted/50` com ícone 16 + label 13/500 + `ChevronRight`:
  `Configurar Metas` (abre `GoalsConfigDialog`) · `Ver Relatório de Metas` (aba `reports`) ·
  `Metas da Equipe` (aba `team`) · `Preferências de Notificações` (`navigateToView('settings')`).
  Use o mesmo mecanismo de navegação já usado por `AIQuickAccess`/`VerTodasButton`; não invente um novo.
- **Card motivacional**: tile 44 `Trophy` amber + título 14/700 + frase 12 muted em itálico. Copy de UI (não é dado):
  reutilize/estenda o array de frases que já existe no `GreetingBanner`, sem duplicar a lógica.

**CP1** — `abas-01-goals.png`; 4 KPIs h alvo da Visão Geral ±6; grade 2 colunas em 1583; 5 gates verdes; contrato da FASE 0 intacto.

---

## FASE 2 — Inteligência Artificial (`ai`) → CP2

Arquivos: reescrita autorizada de `AIQuickAccess.tsx`; novos em `src/components/dashboard/ai/`.
`aiFeatures.ts` (`AI_FEATURES`, `useAIFeatureNavigation`) **já existe — reutilize, não recrie**.
Dados: `useAIStats`, `useAIUsageDashboard`, `AIStatsWidget` como referência de shape.

- **Linha 1 — 3 cards** (`grid xl:grid-cols-3 gap-2.5`), cada um `DashboardCard` com tile 44 + chevron à direita:
  1. **Modelo de IA Ativo** — tile green (`Cpu`), label 12 muted "Modelo de IA Ativo", nome do modelo 16/700,
     descrição 12 muted, badge `● Ativo` (success) no topo direito. Fonte: config de provider de IA já existente;
     sem fonte → "Nenhum modelo configurado" + chevron para settings.
  2. **Análises Disponíveis** — tile blue (`FileText`), valor 22/700 tabular, "Processamentos este mês",
     delta `↑ NN%` + "vs. mês anterior".
  3. **Alertas de Sentimento** — tile amber (`Bell`), valor, "Conversas com sentimento negativo",
     delta, chevron → aba `sentiment`.
- **Grid 3×2 — 6 cards de feature** (`grid md:grid-cols-2 xl:grid-cols-3 gap-2.5`), um por item de `AI_FEATURES`:
  tile 44 na cor da feature, título 15/700, badge opcional (`Popular`/`Novo`) no topo direito,
  descrição 12.5 muted (2 linhas, `line-clamp-2`), rodapé com link `<ação> →` (`text-primary-glow` 13/600)
  e botão circular 36 `bg-muted/60 hover:bg-primary/20` com `ArrowRight` à direita. Clique no card inteiro =
  `handleFeatureClick` atual.
- **Linha final** `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - **"Análises Recentes"** (`SectionHeader` `Clock` 44, `right` = `Ver todas →`): tabela
    `Conversa` (avatar 26 iniciais + nome 13/600 + fila 11 muted) · `Tipo de análise` (badge colorido por tipo) ·
    `Resultado` (badge success "Concluída") · `Data` (relativa, `date-fns` ptBR) · kebab.
    Sem histórico → empty state.
  - **"Insights de IA"** (`SectionHeader` `Lightbulb` 34, `right` = select "Últimas 24 horas"): 3-4 linhas,
    cada uma tile 34 + título 13/700 + texto 12 muted + chip à direita (dot colorido + rótulo).
    **Só renderiza com insight real; sem fonte → empty state** (é o bloco mais tentador para inventar dado — não invente).

**CP2** — `abas-02-ai.png`; 6 cards de feature clicáveis com o comportamento atual; 5 gates verdes.

---

## FASE 3 — Métricas SLA (`sla`) → CP3

Arquivos: reescrita autorizada de `SLAMetricsDashboard.tsx`; novos em `src/components/dashboard/sla/`.
Dados: `useSLAMetrics`, `useSLAConfigurations`, `useSLARules`, `useSLAHistory`.

- **4 KPI** com sparkline **linha** (não barras — se `DashboardKpiCard` só suporta barras, adicione a prop
  `chart?: 'bars' | 'line'` com **default `'bars'`**, regra 0.3.4):
  `Taxa Geral SLA` (%, cor por faixa: ≥80 success, ≥50 warning, senão destructive; tile blue, `Target`) ·
  `No Prazo` (tile green, `CheckCircle2`) · `Violações` (tile red, `XCircle`) · `Total Conversas` (tile blue, `TrendingUp`).
  Cada label acompanha ícone `Info` 13 com `Tooltip` explicando a métrica. Delta: `↓ -N% vs. semana anterior`.
- `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - **"SLA por Agente"** (`SectionHeader` `Users` 44, subtítulo "Desempenho individual de SLA no período selecionado",
    `right` = input de busca 220×32 "Buscar agente…" + select "Ordenar por SLA" + botão ícone 32 `Download`):
    tabela com header sortable (setas `ChevronsUpDown` 12): `Agente` (avatar 26 + nome) · `SLA` (% colorido) ·
    `No Prazo` · `Violações` · `Progresso` (barra 175px colorida pela faixa) · `Status` (badge Bom/Atenção/Crítico).
    Rodapé: `Mostrando 1–N de N agentes` (12 muted) + paginação (botão de página ativo `bg-primary`, `‹` `›` 28×28).
    Export: se já existir função de export no código, ligue nela; se não existir, **não crie** — omita o botão e registre.
  - Rail:
    - **"Resumo Geral"** (`SectionHeader` `Target` 34, `right` = select "Esta Semana"): bloco
      `Taxa de 1ª Resposta no Prazo` com `NN%` 20/700 à direita, barra full-width e delta abaixo;
      + 2 mini-cards lado a lado (`Respostas no Prazo` / `Respostas com Violação`) com tile 28, valor 18/700 e delta.
    - **"Configurações Globais de SLA"** (`SectionHeader` `SlidersHorizontal` 34, subtítulo "Defina metas padrão de
      tempo de primeira resposta por nível de prioridade", `right` = botão primário `+ Novo SLA` h-8):
      tabela `Prioridade` (dot 8px colorido: Urgente red, Alta amber, Média yellow, Baixa green) ·
      `Tempo de 1ª resposta` · `Status` (`Switch`) · `Ações` (`Pencil` / `Trash2` 28×28 ghost).
      Ligue nas mutations de `useSLAConfigurations`/`useSLARules` que já existem; se o toggle não tiver mutation,
      renderize o `Switch` desabilitado e registre no ledger — **não** implemente escrita nova.

**CP3** — `abas-03-sla.png`; tabela ordena e pagina; 5 gates verdes.

---

## FASE 4 — Equipe (`team`) → CP4

Arquivos: reescrita autorizada de `AgentPerformancePanel.tsx`; novos em `src/components/dashboard/team/`.
Dados: `useLeaderboard` (já expõe `conversationsResolved` e `timeRange`), `useSLAMetrics`, `useDashboardData`, `useAgentGamification`.

- **4 KPI** com sparkline linha + gradiente: `Agentes online` (`N/M`, tile blue, `User`, delta "↑ NN% vs. ontem") ·
  `Conversas resolvidas` (tile blue, `MessageSquare`) · `Tempo médio de resposta` (`formatShortDuration`, tile violet,
  `Clock`, delta com `invert`) · `Satisfação média` (`X.X/5`, tile green, `Heart`).
- `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - **"Ranking de Performance"** (`SectionHeader` `Trophy` 44, subtítulo "Desempenho da equipe em tempo real",
    `right` = select "Ordenar por: Conversas resolvidas" + botão `Download` "Exportar" — mesma regra de export da FASE 3):
    tabela com header de ícones (12 muted): `#` · `Agente` · `Resolvidas` · `Mensagens` · `Tempo de resposta` ·
    `SLA` · `XP` · `Nível`.
    Top 3: linha com `border border-{amber,slate,orange}-500/30 bg-{...}/5 rounded-lg` e medalha (ícone `Trophy`/`Medal`
    em tile 28 na cor da posição) no lugar do número. Demais: número 13/600 muted.
    `Agente` = avatar 28 + nome 13/600 + status (dot 6px + `Online`/`Em atendimento`/`Offline` 11).
    `Resolvidas` = valor 15/700 + delta 11 (`↑ NN%` success / `↓` destructive).
    `SLA` = `NN%` 12/600 + barra 110px colorida por faixa. `Nível` = badge `Nvl. N` (`bg-primary/15 text-primary-glow`).
  - Rail:
    - **"Destaque do dia"** (`SectionHeader` `Star` 34, `right` = badge `Nvl. N`): avatar 44 + nome 15/700 +
      texto 12 muted; grade 2×2 (ou 4 colunas) de métricas (`Resolvidas`, `SLA`, `Tempo médio`, `Satisfação`)
      valor 15/700 + rótulo 11 muted; abaixo, card `bg-primary/10 border-primary/25` com ícone de aspas + frase
      (copy de UI). Sem agente destaque → esconder o card.
    - **"Distribuição da equipe"**: donut (recharts `PieChart`, `innerRadius` deixando o miolo livre) com total
      no centro (`N` 20/700 + `Agentes` 11 muted) + legenda: dot + rótulo + contagem + `%`
      (Online = `--dash-green`, Em atendimento = `--dash-blue`, Offline = muted).
    - **"Metas da equipe"** (`right` = `Ver todas →` que leva à aba `goals`): 4 linhas com dot colorido + rótulo 12.5 +
      `atual / meta` à direita + barra + `%` 12/700 na cor do status.

**CP4** — `abas-04-team.png`; ranking com dados reais do `useLeaderboard`; 5 gates verdes.

---

## FASE 5 — Satisfação (`satisfaction`) → CP5

Arquivos: reescrita autorizada de `SatisfactionMetrics.tsx`; `CSATDashboard.tsx` **não** é reescrito
(componente compartilhado fora de `dashboard/`) — ele é embutido dentro dos cards novos ou permanece abaixo,
o que exigir menor diff. Registre a decisão no ledger.
Dados: hooks já consumidos por `SatisfactionMetrics`/`CSATDashboard`.
Esta aba **hoje não tem dado real na base** — os empty states são o comportamento correto e devem ficar bonitos.

- **4 KPI**: `CSAT` (tile green, `MessageCircle`) · `NPS` (tile blue, `Users`) · `Respostas CSAT`
  (tile violet, `MessageSquare`, subtítulo "nos últimos 30 dias") · `Top Agente` (tile amber, `Crown`).
  Sem dado: valor = `—` (24/700 muted), sublegenda honesta ("sem avaliações no período" / "sem período anterior"),
  e no lugar do sparkline um ícone 20 muted/40 + rótulo 11 ("Sem avaliações no período" / "Sem variação").
- `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - Principal:
    - **"Evolução da Satisfação"** (`SectionHeader` `TrendingUp` 44, subtítulo "CSAT e NPS ao longo do tempo",
      `right` = select `CSAT e NPS`): gráfico de linha com eixo Y 0–100 rotulado "Pontuação" e eixo X por hora;
      **empty state centralizado dentro da área do gráfico** (ícone `BarChart3` 28 primary, título 14/600,
      2 linhas 12 muted, botão `Selecionar outro período` que abre o seletor de período do `DashboardFilters`);
      legenda inferior com dots CSAT/NPS.
    - **"Distribuição das avaliações (CSAT)"** (`SectionHeader` `BarChart3` 44, subtítulo "Percentual de respostas
      por nota"): barras por nota 1–5; empty state com ícone `Star` + "Sem avaliações no período" + 1 linha de apoio.
  - Rail:
    - **"Satisfação por fila"** (`Layers` 34, subtítulo "CSAT médio e volume de respostas por fila",
      `right` = select `CSAT`) — empty: ícone `Layers` + "Sem dados para exibir" + 1 linha.
    - **"Top agentes por satisfação"** (`User` 34, `right` = selects `CSAT` + `Top 5`) — mesmo padrão de empty.
    - **Card "Dica"** dismissível (ícone `Lightbulb` amber, título 13/700, texto 12 muted, `X` 24 no canto).
      O dismiss é estado local do componente; **não** persistir em localStorage.

**CP5** — `abas-05-satisfaction.png` com todos os empty states desenhados (nenhum "0" ou nome inventado); 5 gates verdes.

---

## FASE 6 — Sentimento (`sentiment`) → CP6

Arquivos: reescrita autorizada de `SentimentTabContent.tsx` e do wrapper usado no `TabsContent`;
`SentimentTrendChart.tsx`/`SentimentHelpers.tsx` só mudam se necessário — preferir consumir.
Dados: `useRealSentimentData` (de `SentimentHelpers.tsx`) — **é este o hook usado, não `useSentimentData.ts`**.

- **4 KPI**:
  1. `Sentimento Médio` — valor `0,62` (2 casas, vírgula ptBR), badge `Positivo`/`Neutro`/`Negativo` no topo direito,
     sparkline linha verde à direita, delta `↑ NN% vs. ontem`. Tile green (`Smile`).
  2. `% Positivo` — valor `NN%`, barra verde full-width + `N de M conversas` 11 muted. Tile green.
  3. `% Negativo` — idem em vermelho. Tile red (`Frown`).
  4. `Alertas de Sentimento` — valor N, "Conversas que precisam de atenção", tile amber (`AlertTriangle`),
     chevron que rola até a lista de alertas.
- `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - **"Tendência de Sentimento"** (`SectionHeader` `Smile` 44, subtítulo "Evolução do sentimento nas conversas ao
    longo do tempo", `right` = select com ícone `Calendar` "Últimos 14 dias"): area chart recharts, 2 séries
    (Positivo `--dash-green`, Negativo `--dash-red`), pontos visíveis, grid horizontal `border-border/40`,
    eixo Y `0%–100%`, eixo X datas `dd MMM` ptBR, legenda inferior com dots. Tooltip só no hover.
  - **"Principais insights"** (`Lightbulb` 34, `right` = `Ver relatório →`): 3-4 linhas com tile 34 + título 13/700 +
    texto 12 muted (2 linhas) + `ChevronRight`. Só com insight derivado de dado real; senão empty state.
- Linha final `grid xl:grid-cols-[2fr_1fr] gap-2.5`:
  - **"Alertas recentes de sentimento"** (`AlertTriangle` 44 tile red, subtítulo "Conversas que precisam de atenção
    imediata", `right` = `Ver todos (N)`): lista `h-11` por item: badge `Negativo`/`Neutro` (w-20) + trecho da mensagem
    entre aspas (13, `truncate`) + avatar 24 + nome 12.5 + fila 12 muted + tempo relativo 12 muted + `ChevronRight`.
    Clique abre a conversa pelo mecanismo já existente (se houver); senão, item não clicável.
  - **"Distribuição de Sentimento"**: donut com `Total / N conversas` no centro + legenda Positivo/Negativo/Neutro
    (dot + rótulo + `%` + contagem alinhada à direita, tabular).

**CP6** — `abas-06-sentiment.png`; gráficos com dado real do hook; 5 gates verdes.

---

## FASE 7 — Relatórios (`reports`) → CP7

Arquivos: reescrita autorizada de `ScheduledReportsManager.tsx`; novos em `src/components/dashboard/reports/`.
Preservar integralmente: criação/edição/exclusão de relatório agendado, dialog de formulário, toggles de status,
`REPORT_TYPE_LABELS` (`satisfaction: 'Satisfação'`, `sla: 'Métricas SLA'`, …) e as mutations existentes.

`grid xl:grid-cols-[2fr_1fr] gap-2.5`:
- **"Relatórios Agendados"** (`SectionHeader` `FileText` 44, subtítulo "Configure e gerencie relatórios automáticos
  enviados por email", `right` = botão primário `+ Novo Relatório` h-9 `rounded-lg`):
  linha de filtros `flex gap-2.5`: busca `flex-1 h-9 rounded-lg bg-input` "Buscar relatórios…" (ícone `Search` 16) +
  select `Todos os status` + select `Todas as frequências` + select `Mais recentes` (ícone `ArrowUpDown`).
  Corpo: lista dos relatórios existentes (linha: tile 34 do tipo + nome 14/600 + tipo/frequência 12 muted +
  badge de status + destinatários + `Pencil`/`Trash2`), ou **empty state** dentro de um bloco
  `border border-dashed border-border/60 rounded-xl py-14 text-center`: ícone documento 44 primary,
  título 18/700 "Nenhum relatório agendado ainda", 3 linhas 13 muted, botão primário `+ Criar meu primeiro relatório`
  (abre o mesmo dialog do `+ Novo Relatório`).
- Rail:
  - **"Modelos de Relatórios"** (`LayoutTemplate` 34, subtítulo "Utilize nossos modelos prontos para começar mais
    rápido", `right` = `Ver todos →`): 5 linhas `h-14 rounded-lg hover:bg-muted/40`, cada uma tile 34 colorido +
    título 13/700 + descrição 11.5 muted (2 linhas) + `ChevronRight`:
    `Resumo Executivo` (blue) · `Desempenho da Equipe` (green) · `Métricas de SLA` (violet) ·
    `Volume de Atendimentos` (amber) · `Satisfação do Cliente` (red).
    Clique = abre o dialog de novo relatório **pré-preenchido** com o tipo correspondente (usar o estado do form
    que já existe; se o dialog não aceitar valor inicial, adicione prop opcional com default `undefined`).
  - **"Frequências Comuns"** (`Calendar` 34, subtítulo "Escolha a periodicidade ideal para seu relatório"):
    4 tiles em `grid grid-cols-4 gap-2` (`h-16 rounded-lg border border-border/70`), ícone 16 + rótulo 12/600 +
    sublinha 10 muted: `Diário`/Todo dia · `Semanal`/Toda semana · `Mensal`/Todo mês · `Personalizada`/Sob demanda.
    Selecionado: `bg-primary/15 border-primary/60 text-primary-glow`. A seleção alimenta o dialog de novo relatório.
  - **Card "Dica"** dismissível, igual ao da FASE 5.

**CP7** — `abas-07-reports.png`; criar/editar/excluir relatório continua funcionando; 5 gates verdes.

---

## FASE 8 — QA, PR e produção (CP8)

1. `npm run build` + `node scripts/ci/bundle-budget.mjs`. Registrar delta de bundle.
2. Reduced-motion: `emulateMedia({ reducedMotion: 'reduce' })` — nenhuma transição > 0ms nas 7 abas.
3. Responsivo: 1583 (alvo), 1920, 1280 e 390×844 — `scrollWidth <= innerWidth` nas 7 abas. Screenshots
   `abas-08-{1920,1280,390}-<aba>.png` de pelo menos `sla`, `team` e `reports` (as mais densas).
4. Modo claro: `localStorage.theme='light'` — 7 abas sem texto ilegível. `abas-08-light.png` (uma composição basta).
5. QA funcional por aba (mínimo): trocar sub-tabs de Metas; buscar/ordenar/paginar em SLA; ordenar ranking em Equipe;
   abrir dialog de novo relatório pelos 3 caminhos (botão, empty state, modelo); trocar período em Sentimento;
   clicar as 6 features de IA. Console sem `error`. JSON de resultado no ledger.
6. `npx vitest run` (suíte inteira) + os 5 gates da regra 7.
7. Abrir PR `redesign(dashboard): Navy nas 7 abas restantes` para `main`, corpo = resumo do ledger
   (antes/depois por aba, blocos em empty state por falta de fonte, resíduos). CI verde → merge squash.
8. Verificar deploy de produção do SHA do merge em `READY` e capturar `abas-09-prod-<aba>.png` das 7 abas.
   **Só então** escrever "concluído".

---

## CRITÉRIOS DE ACEITAÇÃO

- As 7 abas usam `DashboardCard`/`SectionHeader`/`DashboardKpiCard` e o mesmo ritmo (`gap-2.5`, `p-3.5`) da Visão Geral.
- Zero token de cor/fonte alterado (`git diff origin/main -- src/styles tailwind.config.ts index.html` = vazio).
- Zero nome, número ou série inventada. Todo bloco sem fonte tem empty state e está listado no ledger.
- Nenhuma funcionalidade das listas da FASE 0 se perdeu.
- typecheck 0 · ratchets verdes · vitest verde · build ok · bundle dentro do orçamento · reduced-motion respeitado ·
  light mode legível · sem overflow em 390/1280/1920.

---

## TEMPLATE DO LEDGER (`docs/design/REDESIGN_DASHBOARD_ABAS_STATUS.md`)

```md
# Redesign das abas do Dashboard — STATUS
Branch: redesign/dashboard-abas-navy · Base: 3bf9a4e1 · Worktree: /workspace/repos/Zapp_Web_V2-dashboard
Preview: <url/porta> · PID: <arquivo>

## Contrato de funcionalidades (FASE 0)
### goals — <o que GoalsDashboard entrega hoje>
### ai — …
### sla — …
### team — …
### satisfaction — …
### sentiment — …
### reports — …

## CP0 [ ] sha= · before=abas-00-before-*.png · gates: typecheck=0 lint=ok tc=ok implicit=ok vitest=ok
## CP1 Metas          [ ] sha= · shot= · KPIs=[_,_,_,_] · empty states: _ · gates 5/5
## CP2 IA             [ ] sha= · shot= · features=6 · insights fonte=sim|não · gates 5/5
## CP3 SLA            [ ] sha= · shot= · export=ligado|omitido(motivo) · switch=mutation|disabled(motivo) · gates 5/5
## CP4 Equipe         [ ] sha= · shot= · ranking rows=_ · donut fonte=_ · gates 5/5
## CP5 Satisfação     [ ] sha= · shot= · blocos em empty: _ · CSATDashboard: embutido|abaixo (motivo) · gates 5/5
## CP6 Sentimento     [ ] sha= · shot= · hook=useRealSentimentData · gates 5/5
## CP7 Relatórios     [ ] sha= · shot= · CRUD ok: criar/editar/excluir · gates 5/5
## CP8 Entrega        [ ] PR= · CI= · merge= · prod=abas-09-prod-*.png

## Blocos sem fonte de dado (empty state honesto)
-
## Divergências plano × código
-
## Iterações do loop visual (máx 3 por fase)
-
## Pendências / resíduos
-
```

---

# APÊNDICE Z — CORREÇÕES PÓS-VALIDAÇÃO (07/09/2026, gerado por auditoria do código real)

**Z.0 Precedência:** onde este apêndice divergir do corpo do plano, **o apêndice vence**. Ele foi escrito
depois de ler o código real; o corpo foi escrito antes. Não re-investigue o que está confirmado aqui.

**Z.1 Base mudou.** O PR #273 (`7bb4c869`) foi mergeado em `main` e restaurou o bloco `dash: { ... }` em
`tailwind.config.ts`, perdido no merge do #272 — sem ele, `bg-dash-tile-blue`/`text-dash-green` **não
compilavam** e os tiles saíam transparentes em produção. Base desta entrega = `origin/main` @ `7bb4c869`.
`grep -c dash tailwind.config.ts` deve ser ≥ 12 **antes e depois** do seu trabalho. Se cair, você quebrou.

**Z.2 Worktree isolado (obrigatório).** Trabalhe **somente** em `/workspace/repos/Zapp_Web_V2-abas`
(branch `redesign/dashboard-abas-navy`). **Nunca** entre em `/workspace/repos/Zapp_Web_V2-dashboard` — há
um processo externo (watchdog) commitando lá — nem em `Zapp_Web_V2` nem em `Zapp_Web_V2-promogifts`.
Se `git status` mostrar algo que você não fez, pare e registre antes de qualquer comando destrutivo.

**Z.3 Primitivos que JÁ existem em `overview/DashboardCard.tsx` — use, não recrie:**
`DashboardCard` · `SectionHeader({icon,title,subtitle,tileSize,right})` · `VerTodasButton({onClick})` ·
`StatusChip({label,tone,pulse})` · `CardSelect({value,onValueChange,options,testid})`.
Todo select dentro de card = `CardSelect`. Todo badge de status = `StatusChip`. Todo "Ver todas →" =
`VerTodasButton`. Criar equivalente novo é violação da regra 0.3.4.

**Z.4 `DashboardKpiCard` — o que ele faz hoje e as ÚNICAS extensões autorizadas.**
Hoje: `{ index, label, value, delta, tile, icon, bars, barsColor }`; `bars` são barras 55×28;
`barsColor ∈ blue|red|green|violet`; **não existe sparkline de linha, não existe cor âmbar, não existe rodapé**.
Extensões autorizadas (todas aditivas, default = comportamento atual, **feitas de uma só vez na FASE 1**):
- `chart?: 'bars' | 'line'` — default `'bars'`; `'line'` desenha path suave 55×28 com `pathLength` 0→1 (respeitar `useReducedMotion`).
- `barsColor` ganha `'amber'` (`bg-dash-amber`).
- `footer?: ReactNode` — default `undefined`; renderiza abaixo do valor (barra de progresso, sublegenda, "N de M conversas").
- `size?: 'compact' | 'tall'` — default `'compact'` (altura atual, 84px); `'tall'` ≈ 108px, só para KPI com `footer`.
Depois da FASE 1 o arquivo **não é mais editado**. Gate de altura: `compact` 84±6, `tall` 108±6
(o corpo do plano dizia "altura da Visão Geral ±6" — vale só para `compact`).

**Z.5 Navegação entre abas não existe** — `tab` é `useState` local do `DashboardView`. Adicione:
em `DashboardView`, `const goToTab = (v: string) => setTab(v);` e passe `onNavigateTab?: (tab: string) => void`
(prop **opcional**, default `undefined`) para `GoalsDashboard`, `AIQuickAccess`, `AgentPerformancePanel` e o
componente da aba Sentimento. Se a prop não vier, o link simplesmente não é renderizado.
Para sair do dashboard continue usando `navigateToView` de `@/hooks/system/useNavigationHistory`
(`settings`, `inbox`, `audit-logs`) — é o mecanismo real, já usado por `DashboardTopBar`, `RecentActivityCard` e `aiFeatures.ts`.

**Z.6 Shapes confirmados (não re-investigue):**
- `useLeaderboard()` → `{ agents: LeaderboardAgent[], isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh }`.
  As colunas do ranking (FASE 4) são **só as que existirem em `LeaderboardAgent`**. Campo inexistente
  (ex.: mensagens, tempo de resposta) → **a coluna não é renderizada** e entra em "Blocos sem fonte" no ledger.
  Proibido preencher com `0`, `—` ou valor derivado fingindo dado.
- `useSLAMetrics(range)` → `{ data: { overall: { overallRate, ... }, byAgent: AgentSLAMetric[] }, loading }`
  — **`loading`, não `isLoading`**.
- `useSLAConfigurations()` → `{ saveMutation, toggleMutation, deleteMutation, openEdit, openCreate, ... }` +
  `PRIORITY_CONFIG` exportado. O `Switch` de "Configurações Globais de SLA" **usa `toggleMutation`** — existe,
  não renderize desabilitado. `PRIORITY_CONFIG` já traz label+cor por prioridade: use, não redefina.
- `useAIStats()` → `{ totalAnalyses, avgSentimentScore, trends: { analyses, sentiment }, ... }`, onde
  `TrendData = { direction: 'up'|'down'|'stable', change, percentage }`. Deltas da FASE 2 vêm de `trends.*.percentage`.
- `useRealSentimentData(days)` → `SentimentData[] | null`, agregado por dia (`positive`, `negative`, `neutral`,
  `total`, `alerts`). `null` = sem dado → empty state, nunca zeros.
- `useGoalsDashboard()` → leia o `return` (≈ linha 210) antes de escrever. Use `getProgressColor`,
  `getProgressBgColor` e `PERIOD_OPTIONS` que o próprio arquivo já exporta; não recrie a escala de cor de progresso.

**Z.7 Os tokens `--dash-*` estão em `:root`, não em `.dark`** — valem também no tema claro, então os tiles
continuam escuros no light mode. Isso **já é o comportamento da Visão Geral**; não corrija nesta entrega.
Só registre no ledger se o gate de light mode (FASE 8.4) mostrar texto ilegível.

**Z.8 Ordem de execução revisada por risco** (o número da fase não muda, a ordem sim):
`FASE 1 Metas → FASE 3 SLA → FASE 4 Equipe → FASE 2 IA → FASE 6 Sentimento → FASE 7 Relatórios → FASE 5 Satisfação`.
Metas primeiro porque carrega a extensão do `DashboardKpiCard` (Z.4) que as outras consomem;
Satisfação por último porque é quase toda empty state e não bloqueia ninguém.

**Z.9 Economia de execução.** Por fase rode `npx vitest run src/components/dashboard` (68 testes, determinístico).
A suíte inteira (`npx vitest run`, 2909 testes) **só na FASE 8** — ela tem flakiness conhecida de timeout/mock
(`GroupsView`, `MediaLibraryAdmin`, `useTheme`) que não é regressão sua.

**Z.10 Dívida pré-existente conhecida — não é sua, não tente consertar:**
`npm run lint` cru ≈ 1201 problemas (edge functions `no-explicit-any`, `tailwind.config.ts` `no-require-imports`);
`typecheck-ratchet` falha por `ThemeCustomizer.tsx`/`PresetCard.tsx`/`presets.ts`/`contact.service.ts`;
check de CI "Contrato DB offline" falha por `.rpc('get_last_message_dates')` em `contact.service.ts:60`.
Os três **já falham em `main`**. Seu gate é *comparação com o baseline da FASE 0*, não zero absoluto.
Se o lint-ratchet acusar dívida nova só por deslocamento de linha (armadilha do `contextHash`), mova sua
inserção para depois do trecho legado; só use `--update-baseline` com o diff conferido linha a linha e justificado no ledger.

**Z.11 PR e merge.** Abra o PR ao fim da FASE 8 (`gh` não autentica neste container por falta de scope
`read:org`; use o token `x-access-token` de `/workspace/.git-credentials` via `curl` na API REST, método já
validado no PR #273 — nunca imprima o token). **Não mergeie.** Entregue o PR com o resumo do ledger e pare.

**Z.12 Proibido loop de watchdog.** Se algo bloquear (PR aguardando merge, ferramenta indisponível), escreva
o bloqueio **uma única vez** no ledger e **encerre a sessão**. Não relance, não "reconfirme", não commite
"retomada geração N" — o histórico deste repo tem 6 gerações de reconfirmação sem nenhum trabalho novo.
