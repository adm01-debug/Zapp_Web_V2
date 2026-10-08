Especialista: worker (testes)

# AUDITORIA A11Y E CELULAR — Tarefas, Quadro, Conquistas, Dashboard e Analytics (Y16)

- **Data:** 2026-10-07 · **Cartão:** t_ffee2c1f (Y16) · **Área:** testes do produto (`area-testes-do-produto`) · **Plano:** `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo de telas:** Tarefas (lista), Quadro/Colunas (`pipeline`, cartões e arrastar), ficha da tarefa (Sheet "Editar tarefa"), Conquistas, Dashboard (Visão Geral) e Analytics — Relatórios (7 abas), Sentimento, NPS **e as 9 abas do Dashboard** (Visão Geral, Analytics, Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios).

## 1. Método (o que foi realmente executado)

| Item | Valor |
|---|---|
| App | dev server do PRÓPRIO workspace (`bunx vite --port 5199 --strictPort`, `127.0.0.1:5199`, `VITE_CRM_INTEGRATION_ENABLED=true`) |
| Sessão | FALSA, injetada no `localStorage` por `installFakeSession` (perfil `admin` sintético). Nenhum login real. |
| Backend | 100% mockado por `page.route` (identidade, `user_roles`, RPCs `dashboard_kpi`/`dashboard_contact_counts`/`dashboard_leaderboard`, `messages`, `contacts`, `conversation_tasks`, `agent_achievements`, `agent_stats`, `nps_surveys`, `conversation_analyses`, `queues`, `conversation_events`, `scheduled_report_configs`). Escritas → 403; toda a rede real cai em `bloquearRedeReal` (403) e é contada. |
| Dados | sintéticos (2 contatos, 3 tarefas, 8 mensagens, 2 conquistas, 2 pesquisas NPS, 2 análises de sentimento). Nenhum dado de cliente, telefone, CPF/CNPJ, URL ou credencial de produção. |
| Viewports | **390×844** e **1280×800** |
| Temas | **claro** e **escuro** (`localStorage.theme` antes do boot) |
| Ferramenta | Playwright (Chromium) + axe-core (`axe.run(document.body)`, catálogo completo, `resultTypes: ['violations']`) |
| Medições por tela | axe; rolagem horizontal; alvos de toque; nome acessível; ordem de tabulação (18 `Tab`) + anel de foco; gráficos (alternativa textual); diálogos (caber na viewport) |
| Rodada principal | `4 passed (≈4m)` — **36 medições** de axe + 36 de rolagem + 36 de alvos + 36 de nomes + 36 de foco + 36 de gráficos + 4 de diálogo; **0 erro de medição** (0 `nao-abriu`). `dados.jsonl` = **224 registros**. |
| Rodada extra "abas" | `abas.spec.ts` — 18 medições (9 abas do Dashboard × 2 viewports, incluindo as sub-abas Volume/Resposta/Satisfação e Hoje/Semana/Mês); 7 abas de Relatórios e 4 de Sentimento medidas em 390×844 (`abas.jsonl` = 33 registros) |
| Rodadas de apoio | `detalhe.spec.ts` (lista completa de nós por violação, 4 medições), `probe.spec.ts` (alternativa textual dos gráficos, 2), `sonda.spec.ts` (DOM: abas e controles sem nome, 3) |
| Harness | specs e configs preservados como `.txt`/`.py` em `.tmp/a11y-audit/` — **fora do git; não foram commitados nem anexados ao cartão**. O diff do cartão traz só este `.md`. |
| Dados brutos | `.tmp/a11y-audit/{dados,abas,abas-dash,detalhe,probe,sonda}.jsonl`, fora do git; resumos derivados `resumo.txt`/`alvos.txt` e `analisa.py`/`analisa2.py` no mesmo diretório |

### Desvios declarados (medições fora do que o cartão pediu)

1. **Banco e sessão (desvio principal).** A medição rodou com **backend 100% mockado e sessão FALSA** (`installFakeSession`), e **não** com o **banco LOCAL + usuário admin local** que o cartão pede. Consequência, declarada em cada achado: tudo o que é **estrutura** (nome acessível, ARIA, ordem de foco, tamanho de alvo, hierarquia de títulos, par de cores do tema) vale apesar dos mocks; as **contagens de nós** e a **existência de nós que só aparecem com dado** (quantos cartões/conversas renderizam, quais widgets do Dashboard aparecem, quais KPIs têm selo) **dependem das respostas mockadas**. O `redeBarrada` ficou **0 nas 4 combinações da rodada principal e nas 6 da rodada de abas**: nenhuma requisição escapou para produção.
2. **Dashboard sem dado não tem abas.** Na primeira tentativa da rodada "abas" o Dashboard foi medido com fixtures vazias e a barra `[data-testid="dash-tabs"]` **não monta** (0 `role="tab"`; confirmado pela sonda). A rodada de abas foi refeita com as MESMAS fixtures da rodada principal e as 9 abas apareceram — as duas primeiras medições (abas=0) foram descartadas e não entraram em nenhuma contagem.
3. **Amostra do axe.** `axe.run` devolve no máximo **4 nós de amostra por regra** na rodada principal e **3** na rodada de abas. Onde a amostra sozinha não fecha a conta, a divisão por componente usa o `data-testid` do próprio nó (que a amostra traz no HTML) + o registro `nomes` do harness; isso está dito em §7.
4. **NPS não tem abas.** `?view=nps` não expõe nenhum `role="tab"` (0 em 390 e em 1280): a tela é um painel único com H1/H2/H3. A sonda confirmou. Não é falha de medição.

### Limitações honestas (o que NÃO foi medido)

1. **Teclado virtual** cobrindo campos: não é simulável no headless. O que dá para afirmar está na §4: a ficha da tarefa cabe na viewport (390×760 em 390×844 e 420×800 em 1280×800, ambas roláveis) — com a viewport reduzida pelo teclado, o `max-h` é recalculado pelo navegador, mas isso **não foi exercitado**.
2. **Arrastar (DnD) do Quadro**: o gesto de arrastar não foi exercitado (o alvo de arrasto é o cartão inteiro, medido por `getBoundingClientRect`); a auditoria cobriu o cartão como alvo e como `article[role=button]`, não o arrasto em si.
3. **Textos cortados**: não há verificador genérico de truncamento no harness. Por inspeção, os `truncate` do grupo têm o valor completo como texto do elemento (o corte é visual, `text-overflow: ellipsis`), então o leitor de tela lê o valor inteiro; nenhum texto desaparece do DOM. Registrado como observação, não como achado.
4. **Widgets do Dashboard fora das 9 abas**: o Dashboard também tem variante "divulgação progressiva" (`ProgressiveDisclosureDashboard`) que **só é montada quando o backend devolve os widgets por seção**; ela foi medida nas telas em que apareceu (`aria-allowed-attr`, achado 09), mas não em todos os combos.
5. **Cores fora do token**: os pares de cor foram lidos do axe (dois valores reais) e conferidos por cálculo a partir de `src/styles/tokens.css`; não houve medição com medidor de contraste externo.
6. **Ordem de tabulação**: percorri **18 `Tab` por medição** e registrei se cada elemento focado tem anel visível (resultado na §4.2), mas **não** comparei a sequência obtida com uma ordem esperada de tela — o que está provado é que o foco anda e é visível em todo o grupo; não há veredito sobre a ORDEM (ex.: se um controle do rodapé recebe foco antes de um do cabeçalho). Para isso seria preciso um roteiro de ordem por tela, que este cartão não definiu.

## 2. Cobertura

| Tela | 390×844 claro | 390×844 escuro | 1280×800 claro | 1280×800 escuro |
|---|---|---|---|---|
| Tarefas — lista | ✔ | ✔ | ✔ | ✔ |
| Quadro — colunas e cartões | ✔ | ✔ | ✔ | ✔ |
| Quadro — ficha da tarefa (cartão aberto) | ✔ | ✔ | ✔ | ✔ |
| Conquistas | ✔ | ✔ | ✔ | ✔ |
| Dashboard — Visão Geral | ✔ | ✔ | ✔ | ✔ |
| Dashboard — aba Analytics | ✔ | ✔ | ✔ | ✔ |
| Analytics — Relatórios (aba Mensagens) | ✔ | ✔ | ✔ | ✔ |
| Analytics — Sentimento | ✔ | ✔ | ✔ | ✔ |
| Analytics — NPS | ✔ | ✔ | ✔ | ✔ |
| Dashboard — demais 7 abas (Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios) | ✔ (390 claro) | — | ✔ (1280 claro) | — |
| Relatórios — demais 6 abas (Agentes, Contatos, Heatmap, Comparativo, Previsão, Abandono) | ✔ (390 claro) | — | ✔ (1280 claro) | — |
| Sentimento — 4 abas | ✔ (390 claro) | — | — | — |

Total: **36 medições completas** (9 telas × 4 combos) na rodada principal + **18 medições de aba** na rodada extra.

## 3. Achados

### A11Y-TAREFAS_QUADRO_DASH-01 — Botões de modo (Lista/Quadro/Agenda) sem nome acessível no celular · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) · **axe:** `button-name` [critical] — **12 nós** (3 por combo × 2 combos de 390 × 2 telas)
- **Telas:** Tarefas — lista (390 claro e escuro, **3 nós** cada) e Quadro — colunas e cartões (390 claro e escuro, **3 nós** cada). A 1280×800 **não** há violação (o rótulo aparece).
- **Passos:** `?view=tasks` (ou `?view=pipeline`) com viewport de 390 px → o seletor de modo (`Lista` / `Quadro` / `Agenda`) fica logo abaixo do cabeçalho; cada botão é `<button aria-pressed>` com ícone + rótulo.
- **Evidência (axe):** `.text-primary-foreground.h-9.rounded-\[10px\]` → `<button type="button" class="relative flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-sm font-medium transition-colors text-primary-foreground" aria-pressed="true">` e `.hover\:bg-muted\/60.h-9.rounded-\[10px\]:nth-child(2)` / `:nth-child(3)` (os outros dois modos) — "Element does not have inner text that is visible to screen readers / aria-label attribute does not exist or is empty".
- **Causa medida no código:** `src/components/tasks/shared/ModeSwitcher.tsx:46` — `<span className="hidden sm:inline">{label}</span>`: abaixo de 640 px o rótulo sai da árvore de acessibilidade e o botão fica só com o ícone, sem `aria-label`.
- **Arquivo provável:** `src/components/tasks/shared/ModeSwitcher.tsx:30-48` (botão do modo; rótulo escondido na linha 46)
- **Correção sugerida:** `aria-label={label}` no `<button>` do modo (mantendo o `hidden sm:inline` do texto). **Esforço: P**
- **Depende do mock:** não (a barra de modos existe sempre; muda só o modo ativo).

### A11Y-TAREFAS_QUADRO_DASH-02 — `Select` (combobox) sem nome acessível nos filtros e na ficha da tarefa · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `button-name` [critical] em `role="combobox"` — **56 nós**
  - Dashboard — Visão Geral: **6 nós** por combo (24; nos 4 combos) · Dashboard — aba Analytics: **3 nós** por combo (12; nos 4 combos) · Relatórios: **2 nós** por combo (8) · Sentimento: **1 nó** por combo (4) · Quadro — ficha da tarefa: **2 nós** por combo (8).
- **Passos:** `?view=dashboard` (barra de filtros no topo + seletores de período dos cartões de KPI) · `?view=reports` / `?view=sentiment` (barra de filtros) · abrir a ficha de uma tarefa (`?view=pipeline` → cartão) e olhar os campos "Estado" e "Contato".
- **Evidência (axe, com o `data-testid` no HTML):**
  - `button[data-testid="filter-queue"]` → `<button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" dir="ltr" data-state="closed" class="flex items-center ju..." data-testid="filter-queue">` (idem `filter-agent`);
  - `button[data-testid="volume-select"]`, `team-select`, `csat-select`, `sentiment-select` → mesmo `<button role="combobox">` sem nome (período do widget de KPI);
  - `button[data-testid="sheet-estado"]` e `button[data-testid="sheet-contato"]` → mesmo `<button role="combobox">` sem nome na ficha da tarefa;
  - Relatórios/Sentimento: `.rounded-md.border-input.placeholder\:text-muted-foreground:nth-child(2)/(3)` e `.placeholder\:text-muted-foreground` → `<button type="button" role="combobox" ...>` sem nome.
- **Arquivo provável / TODOS os caminhos do mesmo defeito** (`git grep`):
  - `src/components/dashboard/DashboardFilters.tsx:210` (`filter-queue`) e `:231` (`filter-agent`) — `<SelectTrigger>` sem `aria-label` (só `data-testid`);
  - `src/components/dashboard/overview/DashboardCard.tsx:162` — `<SelectTrigger data-testid={testid}>` (usado por `VolumeChart.tsx:82`, `TeamHighlightCard.tsx:36`, `CsatCard.tsx:37`, `SentimentTrendCard.tsx:26`);
  - `src/components/tasks/shared/WorkItemSheet.tsx` — `<SelectTrigger data-testid="sheet-estado">` e `data-testid="sheet-contato"`;
  - `src/components/reports/ReportFilters.tsx` e `src/components/dashboard/SentimentAlertsDashboard.tsx:23` (mesmo padrão de `SelectTrigger` sem rótulo) — **confirmar o arquivo exato da barra de Relatórios/Sentimento pela posição no DOM antes de editar**.
  - contraste com o que já está certo: `DashboardFilters.tsx:256` usa `aria-label="Atualizar"` — o mesmo padrão resolve aqui.
- **Correção sugerida:** `aria-label` em cada `SelectTrigger` ("Filtrar por fila", "Filtrar por agente", "Período do gráfico", "Estado da tarefa", "Contato da tarefa", …). **Esforço: P**
- **Depende do mock:** as **contagens** sim (quantos cartões de KPI renderizam); a ausência de nome, não.

### A11Y-TAREFAS_QUADRO_DASH-03 — Botões só de ícone do cartão "Configure sua conta" sem nome acessível em TODAS as abas do Dashboard · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **16 nós** medidos (2 por tela × 4 combos no Dashboard Visão Geral e 2 × 4 na aba Analytics), e **presentes em todas as 9 abas** na rodada extra (18 medições de aba).
- **Passos:** `?view=dashboard` → o cartão de onboarding "Configure sua conta" fica acima da barra de abas, então aparece em qualquer aba.
- **Evidência (axe):** `.hover\:bg-accent.hover\:text-accent-foreground.w-8:nth-child(1)` e `:nth-child(2)` → `<button class="inline-flex items-ce..." type="button">` sem texto; na aba Analytics os mesmos dois nós saem como `.active\:scale-\[0\.97\].w-8.\[\&_svg\]\:pointer-events-none:nth-child(1)/(2)` (mesma classe base do `ui/button`). A sonda de DOM confirmou o par de irmãos: `button < div.flex.items-center < div.flex.items-center < div.flex.flex-col < div.rounded-2xl.border`.
- **Causa medida no código:** `src/components/onboarding/OnboardingChecklist.tsx:97` (expandir/recolher — `ChevronUp`/`ChevronDown`) e `:98` (dispensar — `X`): `<Button variant="ghost" size="icon" className="h-8 w-8">` com apenas o ícone, sem `aria-label`.
- **Arquivo provável:** `src/components/onboarding/OnboardingChecklist.tsx:96-99`
- **Correção sugerida:** `aria-label="Expandir passos"` / `"Recolher passos"` no botão da linha 97 e `aria-label="Dispensar configuração da conta"` no da 98. **Esforço: P**
- **Depende do mock:** não (o cartão aparece sempre que o onboarding está incompleto).

### A11Y-TAREFAS_QUADRO_DASH-04 — Controles de ícone sem nome na aba Analytics e em Sentimento · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **12 nós**
  - Dashboard — aba Analytics: **2 nós** por combo (8; nos 4 combos) → `<button data-state="closed">` sem texto (controles de ícone dos widgets `DemandPrediction`/heatmaps);
  - Sentimento: **1 nó** por combo (4) → `.rounded-lg.hover\:border-secondary\/50.hover\:shadow-glow-secondary-sm:nth-child(3)` → `<button class="inline-flex items-ce...">`.
- **Passos:** `?view=dashboard` → aba `Analytics`; `?view=sentiment` → barra de ferramentas do painel.
- **Evidência (axe):** `#radix-_r_2n_-content-analytics > .rounded-2xl.text-card-foreground.bg-card > .s...` → `<button data-state="closed">`; e em Sentimento o seletor `.rounded-lg.hover\:border-secondary\/50...:nth-child(3)` → `<button class="inline-flex items-ce...">`.
- **Arquivo provável (a confirmar no cartão de correção):** `src/components/dashboard/DemandPrediction.tsx:70-72` (`TooltipTrigger` que renderiza `<button data-state>` sem nome) e o botão de ícone de `src/components/sentiment/…` (mesma família de `.rounded-lg` + `hover:border-secondary/50` da barra de ferramentas). **Confirmar o `data-testid`/classe exata ao editar** — a amostra do axe traz o HTML mas não o `data-testid` deste nó.
- **Correção sugerida:** `aria-label` no gatilho do tooltip e no botão de ícone da barra de Sentimento. **Esforço: P**
- **Depende do mock:** sim para a existência (os widgets aparecem conforme o dado); a ausência de nome, não.

### A11Y-TAREFAS_QUADRO_DASH-05 — Cartão do Quadro vira `article[role=button]` com controles dentro (ARIA incompatível + interativo aninhado) · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-allowed-role` [minor] **28 nós** + `nested-interactive` [serious] **28 nós** = 56 nós (7 por combo × 4 combos, sempre juntos nas mesmas telas)
- **Tela:** Quadro — colunas e cartões (nos 4 combos). **Não** ocorre na lista de Tarefas (lá o cartão não recebe o `role` do arrasto).
- **Passos:** `?view=pipeline` → qualquer cartão de coluna.
- **Evidência (axe):** `div[data-rfd-droppable-id="backlog"] > div[data-rfd-draggable-context-id="_r_57_"]:nth-child(1) > .hover\:border-primary\/40…` → `<article data-testid="work-item-card" data-mode="board" data-item-id="7a000000-…" tabindex="0" role="button" aria-label="Tarefa sintética 1 —…" class="group relative borde..." aria-describedby="rfd-hidden-…">` — "ARIA role button is not allowed for given element" e "Element has focusable descendants".
- **Causa medida no código:** `src/components/tasks/shared/WorkItemCard.tsx` fixa `role="article"` na linha **177** e espalha `{...(mode === 'board' && dragHandleProps ? dragHandleProps : {})}` na linha **194** — o spread do dnd-kit chega DEPOIS e sobrescreve o `role` com `button` (e traz `tabindex=0`, `aria-describedby`). O cartão contém controles focáveis (checkbox de concluir, botão de contato, menu kebab).
- **Arquivo provável:** `src/components/tasks/shared/WorkItemCard.tsx:172-196` (ordem do spread × `role`) e os controles internos (`:73`, `:117`, `:240`)
- **Correção sugerida:** espalhar `dragHandleProps` ANTES de `role`/`aria-label` (ou remover o `role="article"` e deixar o dnd-kit decidir), e mover o clique de abertura para um `<button>` interno em vez de um contêiner clicável que envolve outros botões. Sem isso, o leitor de tela anuncia um "botão" que contém botões. **Esforço: M**
- **Depende do mock:** não (o defeito é a montagem do cartão).

### A11Y-TAREFAS_QUADRO_DASH-06 — Contraste abaixo de 4,5:1 no tema CLARO em todo o grupo (104 nós em 23 grupos) · **P2**
- **WCAG:** 1.4.3 · **axe:** `color-contrast` [serious] — **104 nós** em **23 grupos** (tela × combo). **Todas** as ocorrências são no tema claro; no escuro sobram 4 nós (2 grupos), no Dashboard 1280.
- **Telas/combos com ocorrência (rodada principal):** Tarefas 1280 claro/escuro (4+4) · Quadro 1280 (4+4) · ficha da tarefa (390 claro 3, 390 escuro 1, 1280 claro 7, 1280 escuro 5) · Conquistas (2+2+2+4) · Dashboard Visão Geral (1280 claro **41**, 1280 escuro 4) · Dashboard Analytics (390 claro 5, 390 escuro 3) · Relatórios (1280 claro 1) · Sentimento (390 claro 1, 1280 claro 1) · NPS (390 claro 2, 390 escuro 1, 1280 claro 2, 1280 escuro 1). **Rodada extra (abas do Dashboard, 1280 claro):** Metas 29, IA 21, SLA 17, Equipe 21, Satisfação 26, Sentimento 19, Relatórios 14.
- **Evidência (axe, com a razão medida) — os cinco pares que explicam a conta:**
  - `.mt-1.text-\[13px\].text-foreground-secondary`, `.text-xs.truncate.text-foreground-secondary`, `.text-2xs.truncate.text-foreground-secondary`, `.max-w-\[220px\]`, `#radix-…-trigger-analytics|goals|ai|sla|team|satisfaction|sentiment|reports` (abas inativas) → **1,63–1,76:1** (`#b6c4d8` sobre `#ffffff` / `#f6f6f8` / `#fafafb`). É a maior fatia dos 104 nós (39 nós só no Dashboard Visão Geral).
  - `.w-6.bg-primary\/15`, `.text-2xs.bg-primary\/15.h-6`, `.text-primary-glow`, `.border-primary\/50` (chip de prioridade "Baixa") → **3,36–3,94:1** (`#2463eb`/`#526cef` sobre `#d7e1f7`/`#dee8fc`).
  - `.bg-primary\/10` e `.bg-xp\/10` (badges de Conquistas) → **4,49:1** (`#2463eb` sobre `#e9effd`) — 0,01 abaixo do mínimo.
  - `.text-destructive` (botão "Cancelar" da ficha, avisos) e `div[data-title=""]` → **3,1–3,78:1** (`#ef4343` sobre `#f6f7f9`/`#ffffff`/`#f5e5e7`).
  - `.bg-success\/15` (botão "Concluir tarefa") → **4,3:1** (`#157555` sobre `#d4e4e0`); `.bg-secondary` e `.bg-destructive` (badges do NPS, 10 px) → **3,3:1** e **3,78:1** (`#e2ebf3` sobre `#3c7fdd`; `#ffffff` sobre `#ef4343`); `[…] > .text-xs` do KPI com delta verde → **2,13:1** (`#0bcb75` sobre `#ffffff`).
- **Causa medida no código:** o token `--foreground-secondary: 215 30% 78%` existe **só no `:root`** (`src/styles/tokens.css:355`) e **não é redefinido no `.dark`** (`:376-528`): é um cinza-azulado CLARO (`#b6c4d8`), pensado para fundo escuro, usado como **texto no tema claro** em **38 arquivos / 195 linhas** (`git grep -c "text-foreground-secondary" -- src`; a maior concentração é Talk X — 23 em `TalkXCampaignRunning.tsx` — e Multiplix, fora deste grupo). Os demais pares são `text-*-sobre-tinta` com o token de PREENCHIMENTO (`--primary`, `--success`, `--destructive`, `--secondary`) em vez do par de TEXTO.
- **Arquivo provável:** `src/styles/tokens.css:355` (token) e os consumidores DO GRUPO: `src/components/dashboard/overview/DashboardCard.tsx`, `src/components/dashboard/overview/DashboardTabs.tsx:31`, `src/components/dashboard/overview/*Card.tsx`, `src/components/gamification/AchievementsStats.tsx:33,75-80`, `src/components/tasks/shared/WorkItemSheet.tsx` (chip de prioridade e botões), `src/components/nps/NPSDashboard.tsx:98`, `src/components/dashboard/*` (KPIs com delta verde).
- **Correção sugerida — só com tokens que EXISTEM (o cartão proíbe cor nova):**
  - `text-foreground-secondary` como texto no claro → **existe par**: `text-muted-foreground` (`--muted-foreground: 221 10% 40%`) mede **6,1:1** sobre branco e **5,68:1** sobre `#f6f6f8` (cálculo a partir do token; precedente no projeto: `utilities.css` já aplica `text-muted-foreground` em texto secundário). **Ou** dar ao `--foreground-secondary` um valor de tema claro (decisão de token, não deste cartão).
  - `text-primary` / `text-primary-glow` sobre tinta `bg-primary/15` e os badges `bg-primary/10`/`bg-xp/10` (4,49:1) → **existe par**: `hsl(var(--primary-text))` (`tokens.css:124` claro, `:419` escuro) — **8,06:1** sobre a tinta `#e9effd` e **9,36:1** sobre branco (cálculo a partir do token); precedente em `utilities.css:245-246` (`.chip-active`).
  - `text-destructive` sobre claro/tinta → **existe par**: `hsl(var(--destructive-text))` (`tokens.css:169` claro, `:443` escuro) — **6,54:1** sobre `#f6f7f9`; precedente em `utilities.css:226-228`.
  - delta verde do KPI (`text-dash-green` = `#0bcb75`, 2,13:1) → **não existe `--dash-green-text`**; o token de texto mais próximo é `--success` (`160 70% 27%`, **5,66:1** sobre branco). **Confirmar antes de usar** com o Claude se o verde do Dashboard precisa de um par de texto próprio (não criar token neste cartão).
  - `bg-success/15` (4,3:1), `bg-secondary`/`bg-destructive` (badges do NPS) → **não há par de texto** para `success`/`info`/`secondary` no tema (`--success-foreground`/`--info-foreground` são para preenchimento cheio). **Confirmar antes de usar** — exige decisão do Claude; não inventar token.
  - **Esforço: M** (revisão token a token por tela; o `--foreground-secondary` sozinho responde pela maior parte dos 104 nós).
- **Depende do mock:** em parte — os pares de cor são do TEMA (valem sempre); a contagem de nós depende de quantos cartões/linhas renderizam (com dado real os números crescem, não diminuem).

### A11Y-TAREFAS_QUADRO_DASH-07 — `aria-controls` das abas aponta para painel inexistente (Radix `Tabs` sem `TabsContent`) · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-valid-attr-value` [critical] — **4 nós** na rodada principal (1 por combo no Dashboard — aba Analytics) + **2 nós** por aba na rodada extra (aba Analytics e aba Satisfação, 1280 e 390)
- **Passos:** `?view=dashboard` → aba `Analytics` (sub-abas `Volume` / `Resposta` / `Satisfação`) e aba `Satisfação` (sub-abas `Hoje` / `Semana` / `Mês`).
- **Evidência (axe):** `#radix-_r_4p_-trigger-volume` → `<button type="button" role="tab" aria-selected="…" aria-controls="radix-_r_4p_-content-volume" …>` — "Invalid ARIA attribute value: aria-controls=…" (o elemento referenciado não existe no DOM, porque nenhum `TabsContent` é renderizado).
- **Causa medida no código (confirmada):**
  - `src/components/dashboard/ConversationHeatmap.tsx:31` importa `Tabs, TabsList, TabsTrigger` **sem `TabsContent`** e usa os gatilhos `volume`/`response_time`/`satisfaction` nas linhas **164-166**;
  - `src/components/csat/CSATDashboard.tsx:3,47-54` monta `Tabs` + `TabsList` + 3 `TabsTrigger` (`today`/`week`/`month`) e **nenhum `TabsContent`**.
  - É o **mesmo defeito** que o relatório irmão Y14 registrou (CRM-06, `ContactTypeTabs.tsx`) — são 2 arquivos novos do mesmo padrão.
- **Correção sugerida:** como não há painel por aba (as abas trocam o período do mesmo conteúdo), trocar o Radix `Tabs` por um grupo de botões (`role="group"` + `aria-pressed`) — assim o `aria-controls` não fica pendurado. **Esforço: P**
- **Depende do mock:** não (é a montagem das abas).

### A11Y-TAREFAS_QUADRO_DASH-08 — Barra de progresso sem nome acessível (componente `Progress` sem `aria-label`) · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-progressbar-name` [serious] — **12 nós** na rodada principal (1 por tela × combo em Conquistas, Dashboard Visão Geral e Dashboard Analytics) + **1 nó em cada uma das 9 abas do Dashboard** na rodada extra (**Satisfação: 6 nós**, 1280 e 390)
- **Telas:** Conquistas (1 por combo), Dashboard — Visão Geral (1), Dashboard — aba Analytics (1) e todas as abas do Dashboard (1 cada; a aba Satisfação soma 6: checklist + widgets CSAT).
- **Passos:** `?view=achievements` → trilha "Progresso para Nível N"; `?view=dashboard` → cartão "Configure sua conta" e widgets de meta/utilização.
- **Evidência (axe):** `.bg-secondary` → `<div aria-valuemax="100" aria-valuemin="0" aria-valuenow="100" aria-valuetext="100%" role="progressbar" data-state="complete" data-value="100" data-max="100" class="relative w-full overflow-hidden rounded-full bg-seconda…">` — "aria-label attribute does not exist or is empty / aria-labelledby … / Element has no title".
- **Causa medida no código:** `src/components/ui/progress.tsx` monta `ProgressPrimitive.Root` com `value` e repassa `{...props}`, mas **nenhum chamador do grupo passa `aria-label`/`aria-labelledby`**. Chamadores do grupo: `src/components/gamification/AchievementsStats.tsx:33` (Conquistas), `src/components/onboarding/OnboardingChecklist.tsx:74` e `:101` (Dashboard, cartão "Configure sua conta"), `src/components/dashboard/war-room/WarRoomQueueRow.tsx:39`, `src/components/dashboard/war-room/WarRoomAgentCard.tsx:45`, `src/components/dashboard/SatisfactionAgentRanking.tsx:55`, `src/components/dashboard/DashboardWidgetRenderer.tsx:260`, `src/components/csat/CSATDashboard.tsx` (6 na aba Satisfação).
- **Correção sugerida:** passar o rótulo nos chamadores (`<Progress value={…} aria-label={`Progresso para o nível ${n+1}`} />` etc.) — o componente já repassa `{...props}`, então **é só passar a prop**. **Esforço: P**
- **Depende do mock:** em parte (quantas barras cada aba mostra depende do dado; a ausência de nome, não).

### A11Y-TAREFAS_QUADRO_DASH-09 — `aria-expanded` num `div` (gatilho do Collapsible com `asChild`) · **P2**
- **WCAG:** 4.1.2 · **axe:** `aria-allowed-attr` [critical] — **4 nós** (1 por combo no Dashboard — Visão Geral)
- **Passos:** `?view=dashboard` → seções recolhíveis do painel (variante de divulgação progressiva).
- **Evidência (axe):** `div[data-state="closed"][type="button"]` → `<div type="button" aria-expanded="false" data-state="closed">` — "ARIA attribute is not allowed: aria-expanded".
- **Causa medida no código:** `src/components/dashboard/ProgressiveDisclosureDashboard.tsx:76-78` — `<CollapsibleTrigger asChild><div>…</div></CollapsibleTrigger>`: o Radix injeta `type="button"`, `aria-expanded` e `data-state` num `div` genérico (sem `role="button"`), e `aria-expanded` não é permitido em `div`.
- **Arquivo provável:** `src/components/dashboard/ProgressiveDisclosureDashboard.tsx:76-78`
- **Correção sugerida:** trocar o `<div>` por `<button type="button">` (ou `role="button"` + `aria-expanded` explícito no filho) — o cabeçalho de seção já é um controle de expandir/recolher. **Esforço: P**
- **Depende do mock:** sim para a existência (a variante só monta quando o backend devolve os widgets por seção).

### A11Y-TAREFAS_QUADRO_DASH-10 — Alvos de toque abaixo de 24×24 px (WCAG 2.5.8 AA) e abaixo de 44 px no celular · **P2**
- **WCAG:** 2.5.8 (Tamanho do alvo — mínimo, AA) e 2.5.5 (AAA, 44×44) · medição própria (`getBoundingClientRect`, menor largura × menor altura vistas em qualquer combo)
- **Evidência (excertos medidos, com o nome acessível do alvo) — só alvos DAS TELAS DO GRUPO:**
  - `button[data-testid="move-to-menu"].h-6.w-6` → **24×24** (`Mover para` — Tarefas); `button.relative.w-6.h-6` → **24×24** (`Notificações` — Dashboard, cartão)
  - `button.mt-0.5.h-[18px].w-[18px]` → **18×18** (`Concluir tarefa` — Tarefas); `button.rounded.p-0.5.text-muted-foreground` → **18×18** (`Ordenado por prazo, depois prioridade` — Tarefas)
  - `button.h-5.w-5.rounded` → **20×20** (`Política da coluna` — Quadro, cabeçalho de coluna)
  - `button[data-testid="board-prev"].h-8.w-8` / `board-next` → **32×32** (`Coluna anterior` / `Próxima coluna` — Quadro)
  - `button[data-testid="filter-refresh"].h-[34px].w-[38px]` → **38×34** (`Atualizar` — Dashboard e aba Analytics); `button.inline-flex.items-center.justify-center` → **32×32** (ícones do Dashboard/Analytics/Sentimento); **16×16** (botão sem rótulo na aba Analytics)
  - chips e trilhos: `button.peer.inline-flex.h-6` → **44×24** (`Com alarme`, `Mostrar concluídas`), `button[data-testid="quick-add-chip-*"].chip-btn` → **64×28 / 65×28 / 84×28 / 112×28** (`Hoje`, `Data`, `Amanhã`, `Próx. semana`), `button[data-testid="quick-add-more"]` → **38×28** (`Mais opções`)
  - botões de aba de Relatórios/volume: `button.inline-flex.items-center.justify-center` → **44×32** (`Mensagens`, `Agentes`, `Contatos`, `Heatmap`, `Comparativo`, `Previsão`, `Abandono`, `Volume`, `Resposta`)
- **Arquivo provável:** `src/components/tasks/shared/TasksFilterBar.tsx` (chips/quick-add), `src/components/tasks/shared/WorkItemCard.tsx:73` (checkbox 18×18), `src/components/tasks/shared/TasksBoardMode.tsx` (board-prev/next, política da coluna), `src/components/dashboard/DashboardFilters.tsx:252` (refresh), `src/components/tasks/shared/ModeSwitcher.tsx` / abas de Relatórios (32–36 px de altura).
- **Correção sugerida:** dar área mínima de 24×24 px (e 44×44 no celular) ao alvo clicável via `padding`/`min-h`/`min-w` ou `::before` com área estendida, sem mudar o desenho. **Esforço: M**
- **Depende do mock:** não para os tamanhos (vêm do CSS); as contagens dependem de quantos itens renderizam.
- **Fora do escopo:** os alvos do CASCO (`38×38` do menu lateral/topbar, `40×40`, `41×30` das seções) aparecem em todas as telas e são do cartão **Y18** (o Y14 já os registrou assim) — **não duplicar aqui**. O botão "Close toast" (sonner, **20×20**) é do sistema de notificações, também fora do grupo.

### A11Y-TAREFAS_QUADRO_DASH-11 — Campo de descrição da ficha da tarefa sem rótulo acessível · **P3**
- **WCAG:** 1.3.1 / 4.1.2 / 3.3.2 · **axe:** `label` [critical] — **4 nós** (1 por combo na ficha da tarefa)
- **Passos:** `?view=pipeline` → clicar num cartão → ficha "Editar tarefa" → campo de descrição (textarea "Descrição").
- **Evidência (axe):** `textarea[data-testid="sheet-descricao"]` → `<textarea class="flex min-h-[80px] w-…" rows="3">` — "Element does not have an implicit (wrapped) `<label>` / … explicit `<label>` / aria-label attribute does not exist".
- **Arquivo provável:** `src/components/tasks/shared/WorkItemSheet.tsx` (textarea `data-testid="sheet-descricao"`)
- **Correção sugerida:** `<Label htmlFor>` + `id` no textarea (ou `aria-label="Descrição da tarefa"`). **Esforço: P**
- **Depende do mock:** não.

### A11Y-TAREFAS_QUADRO_DASH-12 — Ordem de títulos: `CardTitle` (h3) logo após o H1, sem H2 · **P3**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate] — **18 nós** (16 grupos): Conquistas (390, 2 combos), Dashboard — Visão Geral (390, 2), Dashboard — aba Analytics (4 combos, 2 nós em 390 e 1 em 1280), Relatórios (4 combos), Sentimento (4 combos); na rodada extra, toda aba do Dashboard tem 1–2 nós.
- **Passos:** qualquer tela do grupo com cartão: o H1 da página é o título, e o primeiro cabeçalho de cartão é um `h3`.
- **Evidência (axe):** `h3` → `<h3 class="font-semibold tracking-tight text-xl">Minhas Conquistas</h3>` (Conquistas) e `… > .justify-between.items-center.flex > h3` (cartões do Dashboard) — "Heading order invalid". A sonda de DOM mostrou a sequência real no Dashboard: `H1:Dashboard` → `H3:Configure sua conta`.
- **Causa medida no código:** `src/components/ui/card.tsx` renderiza `CardTitle` como `h3`; o Dashboard usa `Tabs` (h1) e os cartões (h3) sem nenhum `h2` intermediário. Em Conquistas, `src/components/gamification/AchievementsPanel.tsx:58` (`<CardTitle className="text-xl">Minhas Conquistas</CardTitle>`).
- **Arquivo provável:** `src/components/ui/card.tsx` (CardTitle = h3) e os consumidores do grupo (`AchievementsPanel.tsx:58`, cartões do Dashboard/Relatórios/Sentimento).
- **Correção sugerida:** promover o título da página/aba a `h2` (ou permitir `as`/`headingLevel` no `CardTitle` e usar `h2` nas seções de topo). **Esforço: M** (mexe em componente compartilhado; confirmar com o Claude o menor caminho).
- **Depende do mock:** não.

### A11Y-TAREFAS_QUADRO_DASH-13 — Região rolável sem foco por teclado · **P3**
- **WCAG:** 2.1.1 / 2.4.3 (axe: best-practice) · **axe:** `scrollable-region-focusable` [serious] — **6 nós** (4 no Dashboard — aba Analytics, 1 por combo; 2 em NPS no 390)
- **Passos:** `?view=dashboard` → aba `Analytics` (heatmaps com rolagem horizontal); `?view=nps` → 390 px (lista com rolagem vertical).
- **Evidência (axe):** `.rounded-2xl.text-card-foreground.bg-card:nth-child(1) > .pt-0.p-6 > .overflow-x-auto` (Analytics) e `.overflow-y-auto` (NPS) — "Element has scrollable content, but is not focusable".
- **Arquivo provável:** `src/components/dashboard/ActivityHeatmap.tsx:218` e `src/components/dashboard/ConversationHeatmap.tsx:197` (`overflow-x-auto` sem `tabIndex={0}`/`role="region"`), e o contêiner `.overflow-y-auto` da tela de NPS (`NPSDashboard.tsx` — confirmar a linha exata no cartão de correção).
- **Correção sugerida:** `tabIndex={0}` + `role="region"` + `aria-label` na região rolável (ou remover a rolagem dando quebra responsiva). **Esforço: P**
- **Depende do mock:** sim para NPS (a lista só rola com dados); o heatmap do Analytics é fixo.

### A11Y-TAREFAS_QUADRO_DASH-14 — Gráficos sem alternativa textual · **P3**
- **WCAG:** 1.1.1 (Conteúdo não textual) · **axe:** **não** acusa (`role="application"` é válido); medido pelo harness próprio (presença de `aria-label`, `<title>` interno, `role="img"` e tabela/lista irmã)
- **Telas:** Relatórios (**2 de 6 SVGs** são superfícies de gráfico: `role="application"` sem `aria-label` e sem `<title>`; os outros 4 são ícones de legenda — decorativos), Dashboard — Visão Geral (**1**) e Dashboard — aba Analytics (**1**). Conquistas, Tarefas, Quadro, Sentimento e NPS não têm SVG de gráfico. Na tela de Relatórios **não há tabela nem botão "ver dados"** (`tabelas=0`, `botoes=[]` na sonda).
- **Evidência (sonda/detalhe):** `svg[role="application"]` → `<svg class="recharts-surface" role="application" …>` com `aria-label` ausente e sem `<title>`; ao lado, texto próximo "enviadas recebidas 08/09 10/09 …" (só os rótulos dos eixos aparecem no DOM).
- **Arquivo provável:** `src/components/reports/ReportCharts.tsx` (gráficos de Relatórios) e `src/components/dashboard/overview/VolumeChart.tsx` / `src/components/dashboard/ConversationHeatmap.tsx` (Dashboard) — nenhum tem `accessibilityLayer`/`aria-label`/`<title>`.
- **Correção sugerida:** dar nome ao gráfico (`aria-label` no contêiner do cartão + `<title>`/`desc` no SVG ou `<figcaption>`) e, no caso do Relatórios, oferecer o mesmo dado em tabela (o cartão de correção decide o formato). **Esforço: M**
- **Depende do mock:** sim (quantos gráficos renderizam depende do dado; a ausência de alternativa acompanha cada gráfico).

## 4. Verificado SEM problema (e como foi verificado)

1. **Rolagem horizontal:** **0 estouros em 36 medições** (`document.documentElement.scrollWidth == clientWidth`: 390/390 e 1280/1280) e 0 elementos fora da largura da viewport com ancestral que não recorta. Vale para as 9 telas do grupo nos dois viewports e temas.
2. **Foco de teclado visível:** 18 `Tab` por medição × **36 medições** — **0 elementos focados sem anel** (outline ≥ 1 px ou `box-shadow` presente). Não há, no grupo, controle alcançável por teclado sem indicação visual.
3. **A ficha da tarefa cabe na viewport:** `[role="dialog"][data-testid="work-item-sheet"]` mede **390×760** em 390×844 (topo 84, rolável) e **420×800** em 1280×800 (rolável), com título "Editar tarefa". Nenhum diálogo do grupo estourou largura ou altura.
4. **NPS não é uma tela de abas:** 0 `role="tab"` em 390 e 1280 e hierarquia `H1:Nps → H2:Net Promoter Score (NPS) → H3:Pesquisas Recentes` **correta** (é a única tela do grupo sem `heading-order`).
5. **Nome acessível dos controles principais:** o registro `nomes` do harness encontrou **0** elementos interativos sem nome em Tarefas (lista), Quadro (colunas) e NPS; os casos das outras telas estão todos atribuídos aos achados 01–04.
6. **Rede real:** `redeBarrada` = **0** nas 4 combinações da rodada principal e nas 6 da rodada de abas. Nenhuma chamada ao Supabase real nem à Mapbox: a auditoria correu 100% em dados sintéticos e backend mockado (desvio 1).
7. **Sem erro de medição:** as 36 execuções de axe/rolagem/alvos/nomes/foco/gráficos concluíram (0 exceções no harness; 0 `nao-abriu`). As 2 medições descartadas da rodada de abas (Dashboard sem dado, abas=0) estão no desvio 2 e não entraram em contagem nenhuma.

## 5. Resumo por severidade

| Severidade | Qtde | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 4 | 01, 02, 03, 04 |
| P2 | 6 | 05, 06, 07, 08, 09, 10 |
| P3 | 4 | 11, 12, 13, 14 |
| **Total** | **14** | |

Critérios: **P0** bloquearia o uso da tela; **P1** barra o uso por leitor de tela/teclado em ação central do grupo (nome acessível ausente em controle de uso corrente); **P2** barra ou degrada em condição específica (tema, tamanho de alvo, ARIA inválido, contraste); **P3** melhoria de conformidade/prática, sem bloquear.

## 6. Resumo por tela

| Tela | Achados |
|---|---|
| Tarefas — lista | 01 (P1), 10 (P2) |
| Quadro — colunas e cartões | 01 (P1), 05 (P2), 10 (P2) |
| Quadro — ficha da tarefa | 02 (P1), 06 (P2), 10 (P2), 11 (P3) |
| Conquistas | 06 (P2), 08 (P2), 12 (P3) |
| Dashboard — Visão Geral | 02 (P1), 03 (P1), 06 (P2), 08 (P2), 09 (P2), 10 (P2), 12 (P3), 14 (P3) |
| Dashboard — aba Analytics | 02 (P1), 03 (P1), 04 (P1), 06 (P2), 07 (P2), 08 (P2), 10 (P2), 12 (P3), 13 (P3), 14 (P3) |
| Analytics — Relatórios (7 abas) | 02 (P1), 06 (P2), 10 (P2), 12 (P3), 14 (P3) |
| Analytics — Sentimento | 02 (P1), 04 (P1), 06 (P2), 10 (P2), 12 (P3) |
| Analytics — NPS | 06 (P2), 10 (P2), 13 (P3) |
| Dashboard — demais 7 abas (Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios) | 03 (P1, o cartão de onboarding aparece em todas), 06 (P2), 07 (P2, só Satisfação), 08 (P2), 12 (P3) |

## 7. Contagem bruta do axe (por regra × tela × combo)

Números lidos de `.tmp/a11y-audit/dados.jsonl` (**224 registros**; 36 medições de axe). **nós** = elementos distintos acusados; **grupos** = pares tela × combo com pelo menos uma ocorrência. O axe devolve no máximo **4 nós de amostra por regra** (desvio 3), então onde a amostra não fecha a conta a divisão usa o `data-testid` visível no HTML + o registro `nomes`/o código, e isso está dito em cada linha.

| Regra | impacto | nós | grupos | distribuição medida (nós por combo) |
|---|---|---|---|---|
| `color-contrast` | serious | **104** | 23 | Tarefas 1280 **4** (claro e escuro) · Quadro 1280 **4** (claro e escuro) · ficha **3** (390 cl), **1** (390 es), **7** (1280 cl), **5** (1280 es) · Conquistas **2+2+2+4** · Dashboard VG **41** (1280 cl) e **4** (1280 es) · Dashboard Analytics **5** (390 cl), **3** (390 es) · Relatórios **1** (1280 cl) · Sentimento **1** (390 cl), **1** (1280 cl) · NPS **2+1+2+1** |
| `button-name` | critical | **96** | 24 | Tarefas 390 **3** ×2 · Quadro 390 **3** ×2 · ficha **2** ×4 · Dashboard VG **8** ×4 · Dashboard Analytics **7** ×4 · Relatórios **2** ×4 · Sentimento **2** ×4 |
| `aria-allowed-role` | minor | **28** | 4 | Quadro **7** ×4 combos |
| `nested-interactive` | serious | **28** | 4 | Quadro **7** ×4 combos |
| `heading-order` | moderate | **18** | 16 | Conquistas **1** (390 ×2) · Dashboard VG **1** (390 ×2) · Dashboard Analytics **2** (390 ×2) e **1** (1280 ×2) · Relatórios **1** ×4 · Sentimento **1** ×4 |
| `aria-progressbar-name` | serious | **12** | 12 | Conquistas, Dashboard VG e Dashboard Analytics **1** por combo |
| `scrollable-region-focusable` | serious | **6** | 6 | Dashboard Analytics **1** ×4 · NPS **1** (390 cl e es) |
| `label` | critical | **4** | 4 | ficha da tarefa **1** ×4 |
| `aria-allowed-attr` | critical | **4** | 4 | Dashboard VG **1** ×4 |
| `aria-valid-attr-value` | critical | **4** | 4 | Dashboard Analytics **1** ×4 |

**Rodada extra (abas do Dashboard, 1280 claro + 390 claro — 18 medições, `abas-dash.jsonl`):** `button-name` 8 nas 9 abas (2 deles são o cartão de onboarding, achado 03) · `aria-progressbar-name` **1 em cada aba** (6 na aba Satisfação) · `aria-valid-attr-value` na aba Analytics **e** na aba Satisfação · `scrollable-region-focusable` na aba Analytics e na aba Equipe · `color-contrast` no 1280: Metas 29, IA 21, SLA 17, Equipe 21, Satisfação 26, Sentimento 19, Relatórios 14 (todos os pares são os do achado 06).

### Atribuição dos 96 nós de `button-name` (por achado)

| Achado | nós | de onde sai a conta |
|---|---|---|
| **01** (modos Lista/Quadro/Agenda) | **12** | 3 nós × 2 combos de 390 na lista de Tarefas (6) + 3 × 2 combos de 390 no Quadro (6) |
| **02** (`SelectTrigger`) | **56** | Dashboard VG 6 × 4 (24) + Dashboard Analytics 3 × 4 (12) + Relatórios 2 × 4 (8) + Sentimento 1 × 4 (4) + ficha da tarefa 2 × 4 (8) |
| **03** (cartão "Configure sua conta") | **16** | 2 botões de ícone × 4 combos no Dashboard VG (8) + 2 × 4 na aba Analytics (8) |
| **04** (ícones da aba Analytics e de Sentimento) | **12** | 2 nós × 4 combos na aba Analytics (8) + 1 × 4 em Sentimento (4) |
| **Total** | **96** | — |

A soma fecha exatamente os 96 nós da tabela acima. A identificação de cada família usa o que a amostra do axe traz no HTML: os `SelectTrigger` aparecem com `data-testid` (`filter-queue`, `filter-agent`, `volume-select`, `team-select`, `csat-select`, `sentiment-select`, `sheet-estado`, `sheet-contato`) e os dois botões de ícone do onboarding têm o par de irmãos `:nth-child(1)/(2)` dentro do mesmo cartão (confirmado pela sonda de DOM). Os 2 nós de `button[data-state="closed"]` da aba Analytics e o de Sentimento **não** trazem `data-testid` na amostra — estão marcados no achado 04 como **confirmar no cartão de correção**.

Achados **sem** ocorrência de axe, por serem de medição própria: **10** (alvos de toque), **14** (alternativa textual dos gráficos) e a queda de contraste de 4,49:1 dos badges de Conquistas (essa é do axe, mas o valor é limítrofe: 0,01 abaixo do mínimo). Os achados **2, 5, 8, 9, 11 e 12** têm a causa confirmada no arquivo:linha do código atual.

## 8. O que o cartão de correção deve considerar

- Os **quatro P1** são todos **nome acessível** e se resolvem com `aria-label`/`id`+`htmlFor` em **7 arquivos**, um por defeito:
  1. `src/components/tasks/shared/ModeSwitcher.tsx` (01)
  2. `src/components/dashboard/DashboardFilters.tsx` + `src/components/dashboard/overview/DashboardCard.tsx` + `src/components/tasks/shared/WorkItemSheet.tsx` + a barra de filtros de Relatórios/Sentimento (02 — 4 arquivos, **o mesmo defeito**)
  3. `src/components/onboarding/OnboardingChecklist.tsx` (03)
  4. `src/components/dashboard/DemandPrediction.tsx` + o botão de ícone da barra de Sentimento (04 — confirmar o 2º arquivo)
  - cabem **1 ou 2 cartões**: 01+03 são `aria-label` de 1 linha; 02 é o mesmo `SelectTrigger` em 4 arquivos; 04 exige localizar 1 controle sem `data-testid` na amostra.
- O **P2 de contraste (06)** é o maior volume (104 nós) e **não** é um P1 porque nenhum nó é de ação: a maior parte é texto de apoio (`--foreground-secondary`, token do `:root`) e badge sobre tinta. Exige decisão de token: `--primary-text` (8,06:1 sobre a tinta) e `--destructive-text` (6,54:1 sobre branco) **já existem** e resolvem quase tudo; `success`, `secondary` e `info` **não têm par de texto** no tema e precisam de decisão do Claude antes de abrir o cartão (nada de token novo). O `--foreground-secondary` sozinho responde pela maior fatia — trocar por `text-muted-foreground` no claro resolve sem criar token.
- O `aria-valid-attr-value` (07) é o **mesmo defeito** que o Y14 registrou (`ContactTypeTabs.tsx` sem `TabsContent`): são **2 arquivos novos** (`ConversationHeatmap.tsx`, `CSATDashboard.tsx`) do mesmo padrão Radix `Tabs` sem painel. Vale um cartão que trate os 3 de uma vez.
- O `aria-progressbar-name` (08) é 1 mudança no chamador (o `ui/progress.tsx` já repassa `{...props}`): passar `aria-label` em ~8 chamadores do grupo cobre Conquistas e todo o Dashboard.
- **Fora do escopo deste grupo (não duplicar):** os alvos do casco (38×38/40×40/41×30) e o "Close toast" (20×20) são do cartão **Y18**; o `text-foreground-secondary` também é usado em Talk X (23 usos em um arquivo) e Multiplix — cartões de outros grupos; os P1 de nome acessível de Contatos/CRM e do Inbox já estão no Y14 e no Y13.
- Todo o relatório foi medido com **backend mockado e sessão falsa** (desvio 1): os pares de cor, a estrutura ARIA, o teclado e os alvos valem no app real, mas as **contagens de nós** e os nós que só aparecem com dado (quantos widgets/cartões renderizam, quais selos aparecem) precisam ser reconferidos quando o cartão de correção rodar com o banco LOCAL + admin local que o cartão Y16 pedia.
