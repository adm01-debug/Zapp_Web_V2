Especialista: worker (testes)

# AUDITORIA A11Y E CELULAR — Tarefas, Quadro, Conquistas, Dashboard e Analytics (Y16)

- Data da reexecução: 2026-10-08 UTC, no workspace local do cartão `t_cebab189`.
- Tipo: auditoria (RELATÓRIO). Nenhum arquivo de produto foi alterado; o único arquivo entregue no diff é este relatório.
- Escopo medido: Tarefas, Quadro (colunas, cartões e arrastar), ficha da tarefa, Conquistas, Dashboard (Visão Geral + 9 abas), Analytics/Relatórios (7 abas), Analytics/Sentimento (3 abas) e Analytics/NPS.

## 1. Método executado desta vez

| Item | Evidência real |
|---|---|
| Banco | `zapp-db-local up . y16a11y` subiu o Supabase LOCAL do workspace: `migrations: 775 ok, 21 falha(s) esperadas de 798, seed: ok`, travas conferidas: DNS da produção preso, `cron.launch_active_jobs=off`, `pg_net.batch_size=0`. |
| Usuário | Login real via UI com usuário local `admin.local@promobrindes.com.br` (senha local do seed), papel `admin` em `public.user_roles`. Sem `installFakeSession`, sem storageState de produção, sem `page.route` para mockar Supabase. |
| App | Vite local em `http://127.0.0.1:5203/`, com `VITE_ZAPP_LOCAL_SUPABASE_URL` e `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY` vindos de `zapp-db-local env . y16a11y`. |
| Dados | Seed LOCAL sintético + linhas sintéticas adicionais só no banco local: 5 `conversation_tasks`, 3 `nps_surveys`, 2 `conversation_analyses`. Nenhum dado real de cliente foi usado. |
| Viewports | 390×844 e 1280×800. |
| Temas | Claro e escuro (`localStorage.theme` + classe `.dark`). |
| Ferramentas | Playwright Chromium + `axe-core` (`axe.run(document.body)` nas telas; `axe.run(dialog)` na ficha) + medições DOM (`getBoundingClientRect`, nomes acessíveis, rolagem, gráficos, diálogos) + sequência real de `Tab`. |
| Brutos | `.tmp/a11y-real/audit-results.json` (104 medições de tela/aba), `.tmp/a11y-real/focus-results.json` (104 sequências reais de Tab), `.tmp/a11y-real/sheet-results.json` (4 medições da ficha), scripts usados em `.tmp/a11y-real/*.mjs`. Tudo fora do git. |
| Arrastar do Quadro | Exercitado com mouse real em Playwright: cartão local `10000000-0000-4000-8000-000000000001` foi arrastado de `backlog` para `todo`; prova: `todo count 1` no DOM e `select status ...` retornou `todo`. |

### Limitações que permanecem

1. Teclado virtual cobrindo campos não é simulável no Chromium headless. A ficha da tarefa foi aberta e medida como diálogo: 390×760 em 390×844 e 420×800 em 1280×800, cabendo no viewport; a redução dinâmica causada por teclado virtual não foi exercitada.
2. As contagens de nós são do banco local sintético. As causas estruturais (nome acessível, ARIA, contraste de token, ordem de foco, tamanho de alvo) não dependem de dado real; quantidades podem mudar quando houver mais linhas.
3. A comparação de Tab usou a sequência esperada de controles tabuláveis dentro de `#main-content` e gravou a sequência real via `page.keyboard.press('Tab')`. Resultado: 104/104 sequências com foco visível; 92/104 diferem do modelo DOM bruto por componentes compostos/roving focus (Radix Tabs/tabpanel e botões sem nome que aparecem como `BUTTON`). Essas diferenças estão atribuídas aos achados de nome/estrutura abaixo, não a um achado separado de “anel ausente”.

## 2. Cobertura

| Tela/aba | 390 claro | 390 escuro | 1280 claro | 1280 escuro |
|---|---:|---:|---:|---:|
| Tarefas — lista | ✔ | ✔ | ✔ | ✔ |
| Quadro — colunas/cartões | ✔ | ✔ | ✔ | ✔ |
| Quadro — arrastar | ✔ (prova em 1280 claro) | — | ✔ (prova em 1280 claro) | — |
| Quadro — ficha da tarefa | ✔ | ✔ | ✔ | ✔ |
| Conquistas | ✔ | ✔ | ✔ | ✔ |
| Dashboard — Visão Geral | ✔ | ✔ | ✔ | ✔ |
| Dashboard — abas: Visão Geral, Analytics, Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios | ✔ | ✔ | ✔ | ✔ |
| Analytics — Relatórios + abas Mensagens, Agentes, Contatos, Heatmap, Comparativo, Previsão, Abandono | ✔ | ✔ | ✔ | ✔ |
| Analytics — Sentimento + abas Hoje, Semana, Mês | ✔ | ✔ | ✔ | ✔ |
| Analytics — NPS | ✔ | ✔ | ✔ | ✔ |

Total: 104 medições de tela/aba + 4 medições da ficha da tarefa = 108 medições com axe/DOM; 104 sequências reais de tabulação; 1 exercício de arrastar com mutação no banco local.

## 3. Resumo bruto do axe na reexecução local

| Regra axe | Nós medidos |
|---|---:|
| `button-name` | 368 |
| `color-contrast` | 390 |
| `heading-order` | 76 |
| `aria-progressbar-name` | 54 |
| `aria-allowed-role` | 20 |
| `nested-interactive` | 20 |
| `scrollable-region-focusable` | 12 |
| `aria-allowed-attr` | 8 |
| `aria-valid-attr-value` | 6 |
| `label` | 1 |

## 4. Achados

### A11Y-TAREFAS_QUADRO_DASH-01 — Botões Lista/Quadro/Agenda sem nome acessível no celular · P1
- WCAG: 4.1.2. Axe: `button-name`.
- Tela: Tarefas e Quadro em 390 px.
- Passos: abrir `?view=tasks` ou `?view=pipeline` em 390×844; os botões do seletor de modo ficam apenas com ícone.
- Evidência: seletor axe `.text-primary-foreground.h-9.rounded-[10px]` e `.hover:bg-muted/60.h-9...`; HTML do botão contém `aria-pressed`, ícone e `<span className="hidden sm:inline">{label}</span>`, sem `aria-label`.
- Arquivo provável: `src/components/tasks/shared/ModeSwitcher.tsx:45-47`.
- Correção sugerida: adicionar `aria-label={label}` no `<button>` do modo. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-02 — `SelectTrigger`/combobox sem nome acessível em filtros e ficha · P1
- WCAG: 4.1.2 / 1.3.1. Axe: `button-name` em `role="combobox"`.
- Telas: Dashboard (filtros), Relatórios, Sentimento e ficha da tarefa.
- Evidência: `button[data-testid="filter-queue"]`, `button[data-testid="filter-agent"]`, seletores de período/agent em Relatórios, select de Sentimento e `sheet-estado`/`sheet-contato` na ficha aparecem sem nome explícito.
- Arquivos prováveis: `src/components/dashboard/DashboardFilters.tsx:209-232`, `src/components/tasks/shared/WorkItemSheet.tsx:217` e `:277`, `src/components/reports/AdvancedReportsView.tsx`, `src/components/dashboard/SentimentAlertsDashboard.tsx`.
- Correção sugerida: `aria-label` específico em cada `SelectTrigger` (“Filtrar por fila”, “Filtrar por agente”, “Estado da tarefa”, etc.). Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-03 — Botões de ícone do onboarding sem nome acessível · P1
- WCAG: 4.1.2. Axe: `button-name`.
- Telas: Dashboard — todas as abas onde aparece “Configure sua conta”.
- Evidência: botões `size="icon"` de expandir/recolher e dispensar no cartão de onboarding, medidos como `button-name`.
- Arquivo provável: `src/components/onboarding/OnboardingChecklist.tsx:97-98`.
- Correção sugerida: `aria-label="Expandir/Recolher passos"` e `aria-label="Dispensar configuração da conta"`. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-04 — Outros botões só de ícone sem nome em Dashboard/Analytics/Sentimento · P1
- WCAG: 4.1.2. Axe: `button-name`; medição própria também encontrou controles sem nome na ordem de Tab (`BUTTON`).
- Telas: Dashboard/Analytics e Sentimento.
- Evidência: amostras axe de `<button class="inline-flex items-ce...">` e `button[data-state="closed"]` sem texto/nome; top dos alvos pequenos também lista `button 32×32` sem nome em Dashboard.
- Arquivos prováveis: `src/components/dashboard/DemandPrediction.tsx`, `src/components/dashboard/SentimentAlertsDashboard.tsx` e botões de ação do Dashboard que usam `size="icon"`.
- Correção sugerida: nomear todos os botões icon-only com `aria-label` e manter ícones decorativos com `aria-hidden`. Esforço: M.

### A11Y-TAREFAS_QUADRO_DASH-05 — Cartão do Quadro vira `article role=button` com controles focáveis dentro · P2
- WCAG: 4.1.2 / 1.3.1. Axe: `aria-allowed-role` (20 nós) + `nested-interactive` (20 nós).
- Tela: Quadro em todos os combos.
- Passos: abrir `?view=pipeline` com dados locais; qualquer cartão arrastável.
- Evidência: `<article data-testid="work-item-card" ... tabindex="0" role="button" aria-roledescription="tarefa arrastável">` contém botões internos (checkbox, contato, kebab). O spread de `dragHandleProps` sobrescreve o `role="article"`.
- Arquivo provável: `src/components/tasks/shared/WorkItemCard.tsx:172-195`.
- Correção sugerida: não usar o contêiner inteiro como botão que contém botões; mover a abertura para controle interno ou separar alça de arrasto. Esforço: M.

### A11Y-TAREFAS_QUADRO_DASH-06 — Barras de progresso sem nome acessível · P2
- WCAG: 4.1.2 / 1.3.1. Axe: `aria-progressbar-name` (54 nós).
- Telas: Conquistas e Dashboard (todas as abas com checklist/widgets de progresso).
- Evidência: `<div role="progressbar" aria-valuenow="..." ...>` sem `aria-label`, `aria-labelledby` ou `title`.
- Arquivos prováveis: chamadores de `src/components/ui/progress.tsx`, incluindo `src/components/gamification/AchievementsStats.tsx`, `src/components/onboarding/OnboardingChecklist.tsx:101` e widgets do Dashboard.
- Correção sugerida: passar rótulo contextual (`aria-label="Progresso para o nível..."`, “Progresso da configuração da conta”, etc.). Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-07 — Contraste insuficiente em textos/chips do grupo · P2
- WCAG: 1.4.3. Axe: `color-contrast` (390 nós no banco local sintético).
- Telas: Conquistas, Dashboard, Relatórios, NPS e ficha.
- Evidência: exemplos do axe: `.bg-primary/10`, `.mt-1.text-[13px].text-foreground-secondary`, textos/chips com `text-primary`, `text-destructive`, `text-success` sobre tintas claras; ocorre principalmente no tema claro, mas também aparece em alguns combos escuros.
- Arquivos prováveis: `src/styles/tokens.css` (pares de texto/tinta), `DashboardCard`, `DashboardTabs`, `AchievementsStats`, `WorkItemSheet`, `NPSDashboard` e cartões KPI.
- Correção sugerida: usar pares de texto já existentes (`--primary-text`, `--destructive-text`, `text-muted-foreground`) e decidir par para success/secondary/info antes de alterar token. Esforço: M.

### A11Y-TAREFAS_QUADRO_DASH-08 — `aria-controls` das Tabs aponta para conteúdo inexistente · P2
- WCAG: 4.1.2 / 1.3.1. Axe: `aria-valid-attr-value` (6 nós).
- Telas: Dashboard — aba Analytics e Dashboard — aba Satisfação.
- Evidência: `#radix-...-trigger-volume` / `trigger-month` com `aria-controls="...content..."` que não existe no DOM.
- Arquivos prováveis: `src/components/dashboard/ConversationHeatmap.tsx` e `src/components/csat/CSATDashboard.tsx`.
- Correção sugerida: usar botões com `aria-pressed` quando não há painel por aba, ou renderizar `TabsContent` real. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-09 — `aria-expanded` em `div` no Dashboard · P2
- WCAG: 4.1.2. Axe: `aria-allowed-attr` (8 nós).
- Tela: Dashboard — Visão Geral.
- Evidência: `div[data-state="closed"][type="button"]` com `aria-expanded="false"`.
- Arquivo provável: `src/components/dashboard/ProgressiveDisclosureDashboard.tsx` (CollapsibleTrigger `asChild` com `div`).
- Correção sugerida: trocar o filho por `<button type="button">` ou outro elemento com semântica permitida. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-10 — Alvos de toque abaixo de 44×44 px · P2
- WCAG: 2.5.8 (mínimo 24×24) e 2.5.5 (44×44 recomendado/AAA).
- Telas: todo o grupo, especialmente mobile.
- Evidência medida por `getBoundingClientRect`: `Política da coluna` 20×20, `Abrir conversa` 24×24, botões `filter-refresh` 38×34, `Notificações` 24×24, `Ver todas` 85×26/88×26, tabs/combobox de 32–40 px de altura.
- Arquivos prováveis: `BoardColumn.tsx`, `WorkItemCard.tsx`, `DashboardFilters.tsx`, tabs/relatórios e ações de card.
- Correção sugerida: área clicável mínima via `min-h/min-w` ou padding/área invisível sem mudar o desenho. Esforço: M.

### A11Y-TAREFAS_QUADRO_DASH-11 — Campo de descrição da ficha sem rótulo acessível · P3
- WCAG: 1.3.1 / 4.1.2 / 3.3.2. Axe: `label` (1 nó na ficha).
- Tela: Quadro — ficha da tarefa.
- Evidência: `textarea[data-testid="sheet-descricao"]` sem `Label htmlFor`, `id` ou `aria-label`.
- Arquivo provável: `src/components/tasks/shared/WorkItemSheet.tsx:395-411`.
- Correção sugerida: `Label` + `id` ou `aria-label="Descrição da tarefa"`. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-12 — Ordem de títulos pula níveis · P3
- WCAG: 1.3.1 / 2.4.6. Axe: `heading-order` (76 nós).
- Telas: Conquistas, Dashboard e Relatórios/Sentimento.
- Evidência: H1 da tela seguido por `CardTitle` renderizado como `h3` (ex.: “Minhas Conquistas”, “Configure sua conta”).
- Arquivos prováveis: `src/components/ui/card.tsx` e consumidores do grupo.
- Correção sugerida: permitir nível configurável no CardTitle ou introduzir H2 nas seções principais. Esforço: M.

### A11Y-TAREFAS_QUADRO_DASH-13 — Região rolável sem foco por teclado · P3
- WCAG: 2.1.1 / 2.4.3. Axe: `scrollable-region-focusable` (12 nós).
- Telas: Dashboard — Analytics, Dashboard — Equipe, Dashboard — Satisfação e NPS mobile.
- Evidência: `.overflow-x-auto` e `.overflow-y-auto` com conteúdo rolável, sem `tabIndex={0}`/`role="region"`/nome.
- Arquivos prováveis: `ActivityHeatmap.tsx`, `ConversationHeatmap.tsx`, ranking/equipe e `NPSDashboard.tsx`.
- Correção sugerida: tornar regiões roláveis focáveis e nomeadas ou remover a rolagem com layout responsivo. Esforço: P.

### A11Y-TAREFAS_QUADRO_DASH-14 — Gráficos sem alternativa textual · P3
- WCAG: 1.1.1. Medição própria: 59 SVGs/superfícies de gráfico sem `aria-label` ou `<title>` nas medições locais.
- Telas: Dashboard (Visão Geral, Analytics, Equipe, Sentimento) e Relatórios (Mensagens, Contatos, Previsão, Abandono). NPS/Conquistas/Tarefas não tiveram superfície Recharts equivalente na medição.
- Evidência: `svg.recharts-surface role="application"` sem `aria-label`/`title`; texto próximo contém apenas eixos/legendas.
- Arquivos prováveis: `src/components/reports/ReportCharts.tsx`, `src/components/dashboard/overview/VolumeChart.tsx`, `ConversationHeatmap.tsx` e gráficos de sentimento/equipe.
- Correção sugerida: `<title>/<desc>` ou `aria-label` contextual + alternativa textual/tabela dos mesmos dados. Esforço: M.

## 5. Verificado sem problema ou sem achado novo

1. Rolagem horizontal da página: 0 overflow em todas as 104 medições (`documentElement.scrollWidth <= clientWidth`).
2. Foco visível: 0 sequências com anel ausente em 104 medições reais de `Tab`.
3. Ficha da tarefa cabe na viewport: 390×760 em 390×844 e 420×800 em 1280×800; sem estouro lateral/vertical depois da animação.
4. Arrastar do Quadro foi exercitado e persistiu no banco local (`backlog` → `todo`).
5. Nenhuma medição usou produção, sessão salva, backend mockado ou fixture real remota.

## 6. Resumo por severidade

| Severidade | Qtde | IDs |
|---|---:|---|
| P0 | 0 | — |
| P1 | 4 | 01, 02, 03, 04 |
| P2 | 6 | 05, 06, 07, 08, 09, 10 |
| P3 | 4 | 11, 12, 13, 14 |
| Total | 14 | — |

## 7. Resumo por tela

| Tela | Achados |
|---|---|
| Tarefas — lista | 01 (P1), 10 (P2) |
| Quadro — colunas/cartões/arrastar | 01 (P1), 05 (P2), 10 (P2) |
| Quadro — ficha da tarefa | 02 (P1), 07 (P2), 11 (P3) |
| Conquistas | 06 (P2), 07 (P2), 12 (P3) |
| Dashboard — Visão Geral | 02 (P1), 03 (P1), 06 (P2), 07 (P2), 09 (P2), 10 (P2), 12 (P3), 14 (P3) |
| Dashboard — Analytics | 03 (P1), 04 (P1), 06 (P2), 07 (P2), 08 (P2), 10 (P2), 12 (P3), 13 (P3), 14 (P3) |
| Dashboard — Metas/IA/SLA/Equipe/Satisfação/Sentimento/Relatórios | 03 (P1), 04 (P1 em alguns controles), 06 (P2), 07 (P2), 08 (P2 em Satisfação), 10 (P2), 12 (P3), 13 (P3 em Equipe/Satisfação), 14 (P3 em Sentimento/Equipe/Relatórios) |
| Analytics — Relatórios (7 abas) | 02 (P1), 07 (P2), 10 (P2), 12 (P3), 14 (P3) |
| Analytics — Sentimento (3 abas) | 02 (P1), 04 (P1), 07 (P2), 10 (P2), 12 (P3) |
| Analytics — NPS | 07 (P2), 10 (P2), 13 (P3) |

## 8. O que mudou em relação à entrega recusada

1. Substituí a auditoria com sessão/backend mockados por login real no app local contra Supabase local (`zapp-db-local`) com usuário admin local.
2. Medi todas as telas/abas nos dois viewports e dois temas: 104 medições de tela/aba + 4 da ficha.
3. Exercitei o arrastar do Quadro e provei mudança local de status no banco.
4. Capturei sequência real de Tab e comparei contra a sequência esperada de tabuláveis dentro do conteúdo principal; não há foco sem anel, e as divergências relevantes aparecem como achados de nome/ARIA.
5. Atualizei contagens e conclusões para o ambiente local real; achados que dependiam de mocks foram reclassificados como dependentes apenas da quantidade de dado local, não da existência do defeito estrutural.
