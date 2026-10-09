# AUDITORIA A11Y E CELULAR — Catálogo, Filas, SLA e War Room (Y17)

- **Data:** 2026-10-08 · **Cartão:** t_ce41198d (Y17) · **Área:** testes do produto (`area-testes-do-produto`).
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo do diff é este relatório.
- **Escopo pedido:** Catálogo (grade, galeria, seleção em massa), Filas, metas e SLA, War Room (alertas).

## 1. Método (conjunto LOCAL do cartão, banco LOCAL, admin local)

A medição foi executada contra a pré-visualização local do próprio workspace, apontada para o Supabase local da
tarefa e autenticada com o usuário admin do seed local. Nada de produção; nenhuma sessão salva (`e2e/.auth/*`) foi
lida ou copiada.

| Item | Valor executado |
|---|---|
| Workspace | `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/t-ce41198d-26100806551135` (branch `v2/t-ce41198d-...`, base `dia/2026-10-08` @ `3019e406c`) |
| Banco | `zapp-db-local up "$PWD" y17a11ycatalogo` → **migrations: 786 ok, 21 falha(s) de 809 \| seed: ok \| 347s** e `TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)` (exit 0) |
| Usuário | `admin.local@promobrindes.com.br` do seed local (`profiles.role = admin`), senha sintética do próprio seed; login pela tela `/auth` do app (sem sessão salva) |
| Pré-visualização | Vite local via `zapp-e2e-local` (env `VITE_ZAPP_LOCAL_SUPABASE_URL`/`ANON_KEY` do conjunto local), `http://127.0.0.1:<porta do conjunto>` |
| Ferramenta | Playwright Chromium + `axe-core` injetado em página real (`page.addScriptTag`), mais medidores próprios de DOM |
| Viewports / temas | `390×844` e `1280×800`; tema claro e escuro (`localStorage.theme`) |
| Cobertura | 16 telas/estados × 2 viewports × 2 temas = **64 medições** |
| Dados brutos | `.tmp/a11y-audit-local/resultados.jsonl` (64 linhas), `.tmp/a11y-audit-local/inventario.json`, `.tmp/git-grep-caminhos.txt`, `.tmp/auditoria.log` (temporários, fora do git) |
| Comando verde | `zapp-e2e-local "$PWD" y17a11ycatalogo -c .tmp/a11y-audit-local/playwright.local.config.ts auditoria-a11y.spec.ts` → **1 passed (24.1m)**, `EXIT=0` |

Medidores próprios usados em cada uma das 64 medições: `scrollWidth > clientWidth` do documento e estouros de
`getBoundingClientRect().right`; alvos interativos com `< 44 px`; controles sem nome acessível; texto cortado
(`scrollWidth > clientWidth` com `overflow-x: hidden/clip` ou `text-overflow: ellipsis`); diálogos/popovers fora da
janela; e 12 pressionamentos de `Tab` medindo foco visível (outline/box-shadow) e elementos focados fora da janela.

### O que ficou fora / ressalvas do método

1. **Catálogo sem produto no seed local** (`0 produtos sincronizados`, abas `Produtos 0 / Favoritos 0 / Enviados 0`).
   Grade, modo lista, filtros, seleção em massa e aba Favoritos foram medidos **no estado vazio**; o cartão de
   produto e seus botões (`CatalogProductCard.tsx:324-347`) não puderam ser exercitados. A barra de seleção em massa
   (`CatalogBulkBar`) não monta sem produto — fica como lacuna, não como aprovação.
2. **Teclado virtual físico não é simulável no Chromium headless.** Foi medido o que o headless permite: os campos e
   controles em `390×844`, o overlay de filtros (que ocupou a altura toda da janela) e a ausência de rolagem
   horizontal fora do achado 03.
3. **Ações destrutivas/envio real não foram executadas** (nenhum disparo, e-mail ou mudança de meta salva); os
   diálogos foram abertos e medidos.
4. As duas telas standalone (`/queues/comparison`, `/sla/history`) e os diálogos foram medidos nos 4 combos, exceto
   onde a coluna "alcance" marca o contrário.

## 2. Cobertura local executada

| Estado medido | Rota | 390 claro | 390 escuro | 1280 claro | 1280 escuro |
|---|---|---|---|---|---|
| Catálogo — grade (vazio) | `/?view=catalog` | ✔ | ✔ | ✔ | ✔ |
| Catálogo — filtros avançados | `/?view=catalog` + clique | ✔ | ✔ | ✔ | ✔ |
| Catálogo — modo lista | `/?view=catalog` + `title="Lista"` | ✔ | ✔ | ✔ | ✔ |
| Catálogo — seleção em massa | `/?view=catalog` + "Selecionar" | ✔ | ✔ | ✔ | ✔ |
| Catálogo — aba Favoritos | `/?view=catalog` + aba | ✔ | ✖ | ✖ | ✖ |
| Filas — lista | `/?view=queues` | ✔ | ✔ | ✔ | ✔ |
| Filas — menu do card aberto | `/?view=queues` + "Ações da fila" | ✔ | ✔ | ✔ | ✔ |
| Filas — diálogo Nova Fila | `/?view=queues` + "Nova Fila" | ✔ | ✔ | ✔ | ✔ |
| Filas — diálogo Metas e Alertas | `/?view=queues` + menu + item | ✔ | ✔ | ✔ | ✔ |
| Filas — comparação | `/queues/comparison` | ✔ | ✔ | ✔ | ✔ |
| Fila — detalhe | `/queue/4daa900c-…` (Fila Geral) | ✔ | ✔ | ✔ | ✔ |
| Fila — diálogo Configurar | `/queue/4daa900c-…` + "Configurar" | ✔ | ✔ | ✔ | ✔ |
| SLA — dashboard | `/sla` | ✔ | ✔ | ✔ | ✔ |
| SLA — histórico | `/sla/history` | ✔ | ✔ | ✔ | ✔ |
| War Room — painel | `/?view=warroom` | ✔ | ✔ | ✔ | ✔ |
| War Room — alertas de sentimento | `/?view=sentiment` | ✔ | ✔ | ✔ | ✔ |

`✖` = o clique da aba Favoritos não casou o seletor nos 3 combos seguintes (a aba já vinha selecionada e o seletor
`[role="tab"]:has-text("Favoritos")` passou a apontar para o painel); o estado foi medido em `390×844` claro.

## 3. Resultado bruto do axe nas 64 medições

`nós` = soma de nós das violações do `axe-core` (regras default) nas 64 medições; `medições` = em quantos dos 64
combos aquela regra apareceu.

| Regra axe | Impacto | Nós | Medições | Onde |
|---|---|---:|---:|---|
| `region` | moderate | **236** | 39 | `/queues/comparison` (118), `/queue/:id` (56), SLA (30), War Room (12), Catálogo (9) |
| `button-name` | critical | **142** | 43 | SLA (36), diálogo Nova Fila (32), War Room (12+8), Catálogo (8 por estado), Filas (8+4), comparação (12) |
| `color-contrast` | serious | **60** | 26 | Catálogo (16), SLA (20), Filas (7), War Room (5+3), histórico (6), detalhe (1) |
| `aria-progressbar-name` | serious | **38** | 8 | `/sla` (14), `/?view=warroom` (24) |
| `heading-order` | moderate | **27** | 27 | Catálogo, Filas, detalhe, War Room, alertas |
| `aria-hidden-focus` | serious | **26** | 4 | menu do card em `/?view=queues` |
| `aria-input-field-name` | serious | **16** | 4 | diálogo Metas e Alertas |
| `label` | critical | **16** | 4 | diálogo Metas e Alertas |
| `page-has-heading-one` | moderate | **10** | 10 | `/sla` (2), histórico (2), `/queues/comparison` e estados com menu aberto |
| `landmark-one-main` | moderate | **8** | 8 | `/queues/comparison`, histórico, estados com menu aberto |
| `empty-table-header` | minor | **4** | 4 | detalhamento por fila em `/queues/comparison` |
| **Total** |  | **583** |  |  |

Corroboração independente: o próprio app roda `axe` em desenvolvimento (`src/main.tsx`) e registrou nas 64
navegações **21× `CRITICAL: button-name (2 element(s))`**, **12× `MODERATE: heading-order (1 element(s))`** e
**10× `SERIOUS: color-contrast (1–2 element(s))`** (`.tmp/auditoria.log`).

## 4. Verificado sem problema

1. **Rolagem horizontal:** 62 de 64 medições sem estouro (`documentElement.scrollWidth == clientWidth`). As 2
   exceções são o achado 03.
2. **Foco visível:** **0** elementos com foco e sem indicador (outline ou box-shadow) nos 64 combos × 12 `Tab`.
3. **Modais cabendo na tela:** todos os diálogos/popovers medidos couberam (`Filtros avançados` 340×844 em janela
   390×844; `Nova Fila` 390×468; menu do card 152×151) — nenhum `cabe=false`.
4. **Ordem de tabulação:** a sequência capturada não prende o foco dentro de diálogos abertos (o conteúdo de fundo
   recebe `aria-hidden`, como o próprio axe confirma em `filas-menu-card`).
5. **Falso positivo descartado:** o interruptor "Em estoque" do Catálogo (`button#stock-mgmt`) aparece sem nome no
   medidor próprio porque o nome vem de `<Label htmlFor="stock-mgmt">`; o `axe` **não** acusa `button-name` ali, então
   não é achado. Registrado para o revisor não estranhar a diferença entre os dois medidores.

## 5. Achados

### A11Y-CATALOGO_FILAS_SLA-01 — Botões só de ícone sem nome acessível em Filas, SLA, War Room e Catálogo · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) · **axe:** `button-name` [critical] — **142 nós em 43 das 64 medições**.
- **Telas:** `/?view=queues` (lista, menu aberto e diálogo Nova Fila), `/queues/comparison`, `/sla`,
  `/?view=warroom`, `/?view=sentiment`, relatório de `/?view=catalog`.
- **Passos para reproduzir:** login local como admin → abrir `/?view=queues` → executar axe (ou navegar por `Tab`):
  os botões de ícone não recebem nome; repetir em `/sla` e `/?view=warroom`.
- **Evidência (seletores medidos, sem imagem):**
  - Catálogo: 2 nós por medição com alvo `.w-\[200px\]` → `<button role="combobox" aria-expanded="false" … class="flex h-10 items-cent…">`
    (axe: *"Element does not have inner text that is visible to screen readers / aria-label attribute does not exist"*).
  - Filas: `.border-secondary\/20…hover\:bg-primary\/10.hover\:text-primary.ml-auto` → `<button class="inline-flex items-ce…">`
    (2 cartões = 2 nós por medição).
  - SLA: `.hover\:bg-accent.w-8.h-8` em `td:nth-child(9)` e `.h-10.w-10.hover\:shadow-glow-accent-sm:nth-child(N)`
    (9 nós por medição).
  - War Room: `.h-10.w-10.hover\:shadow-glow-accent-sm:nth-child(1..3)` (3 nós por medição) e, no diálogo Nova Fila,
    8 nós por medição.
- **Arquivo provável (todos os caminhos do mesmo defeito, `git grep -n 'size="icon"'` no grupo):**
  - `src/components/queues/QueueCard.tsx:85` — `<Button variant="ghost" size="icon" className="ml-auto w-8 h-8 hover:bg-primary/10 hover:text-primary" onClick={() => onAddMember(queue)}><Plus className="w-4 h-4" /></Button>` (sem `aria-label`/`title`).
  - `src/components/dashboard/WarRoomDashboard.tsx:76,77,78` — três `Button variant="ghost" size="icon"` dentro de `<Tooltip>`; o `TooltipContent` **não** é nome acessível.
  - `src/components/dashboard/war-room/WarRoomAlertRow.tsx:32` — `<Button variant="ghost" size="icon" className="shrink-0 h-6 w-6" onClick={onDismiss}><XCircle /></Button>`.
  - `src/components/dashboard/SentimentAlertsDashboard.tsx:29` — `<Button variant="outline" size="icon" onClick={fetchData}><RefreshCw /></Button>`.
  - `src/components/queues/QueuesComparisonDashboard.tsx:115,274` — botões `size="icon"` (cabeçalho e linha da tabela).
  - `src/components/catalog/ExternalProductManagement.tsx:864,888` e `src/components/catalog/ExternalProductCatalog.tsx:456,480` — `SelectTrigger` com `SelectValue` vazio quando o valor é `"all"` e o `SelectContent` ainda não montou (nome acessível do gatilho depende do placeholder só depois de abrir).
  - `src/components/queues/SLAAgentTable.tsx`, `SLAMetricCards.tsx`, `CatalogProductCard.tsx:324,332,340,347`,
    `QueuesComparisonDashboard.tsx` — demais sítios com `size="icon"`.
- **Correção sugerida:** dar `aria-label` a todo botão só de ícone (o padrão já existe em
  `CatalogProductCard.tsx:154` e `QueueCard.tsx:39`) e nomear os `SelectTrigger` do Catálogo com `aria-label` do
  rótulo visível, como já se faz em `Catálogo` → `aria-label="Categoria"`/`"Fornecedor"`. **Esforço: P** (mecânico,
  muitos sítios; o casco tem o mesmo defeito e vai em achado próprio).

### A11Y-CATALOGO_FILAS_SLA-02 — Barras de progresso sem nome em SLA e War Room · **P1**
- **WCAG:** 4.1.2 · **axe:** `aria-progressbar-name` [serious] — **38 nós em 8 medições** (`/sla` 14, `/?view=warroom` 24).
- **Telas:** `/sla`, `/sla/history` e `/?view=warroom`, nos dois viewports e temas.
- **Passos para reproduzir:** login local → `/sla` → executar axe: cada `<div role="progressbar" aria-valuenow=…>`
  fica sem `aria-label`/`aria-labelledby`.
- **Evidência:** alvo `.h-2[aria-valuetext="100%"][data-state="complete"]` →
  `<div aria-valuemax="100" aria-valuemin="0" aria-valuenow="100" aria-valuetext="100%" role="progressbar" data-state="complete" …>`;
  motivo do axe: *"aria-label attribute does not exist or is empty"*.
- **Arquivo provável:** `src/components/dashboard/war-room/WarRoomAgentCard.tsx:45`,
  `src/components/dashboard/war-room/WarRoomQueueRow.tsx:39`, `src/components/queues/SLAAgentTable.tsx:82`,
  `src/components/queues/SLADashboard.tsx:180`, `src/components/queues/SLAMetricCards.tsx:50`
  (e `src/components/catalog/CatalogBulkSendDialog.tsx:264`, mesmo padrão, no fluxo de envio em massa).
- **Correção sugerida:** passar `aria-label` (a própria frase da métrica, como "Taxa de SLA do agente X") ao
  componente `Progress`/`ProgressBar`; se o rótulo já existe ao lado, usar `aria-labelledby`. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-03 — Rolagem horizontal no celular em `/queues/comparison` · **P1**
- **WCAG:** 1.4.10 (Reflow) e 2.5.8/2.5.5 (alvo e espaço) · medidor próprio + `region`/`landmark-one-main` no axe.
- **Telas/viewports:** `/queues/comparison` em `390×844`, claro **e** escuro (2 das 64 medições com
  `documentElement.scrollWidth > clientWidth`; nas outras 62 não houve estouro).
- **Passos para reproduzir:** login local → abrir `/queues/comparison` → o documento passa a rolar de lado; ao
  navegar por `Tab`, o foco sai da janela.
- **Evidência (seletores medidos):** `div.absolute.h-24.w-full` com `larg=468 direita=507` (janela de 390 px);
  `button#radix-… «Últimos 7 dias»` com `larg=185 direita=435`; o conteúdo da tabela vive em
  `div.h-full.w-full.rounded-[inherit]` com rolagem interna (`FILA CONTATOS ATRIBUÍDOS AGUARDANDO MENSAGENS…`).
  A sequência de `Tab` registra `button«Últimos 7 dias» FORA-DA-JANELA` e `button«BUTTON» FORA-DA-JANELA` nos dois temas.
- **Arquivo provável:** `src/components/queues/QueuesComparisonDashboard.tsx` (tabela com `colSpan`/largura fixa,
  `TableHead` em `:221-233`) e o seletor de período usado na página (`PeriodSelector`) — o bloco
  `div.absolute.h-24.w-full` é o fundo decorativo do gráfico que não é contido pela coluna.
- **Correção sugerida:** no mobile, trocar a tabela por cartões (ou `overflow-x: auto` **dentro** do container com
  `max-w-full`/`min-w-0` no ancestral) e conter o bloco absoluto do gráfico com `overflow-hidden` no card.
  **Esforço: M**.

### A11Y-CATALOGO_FILAS_SLA-04 — Contraste insuficiente em selos de status e rótulos do grupo · **P1**
- **WCAG:** 1.4.3 (Contraste mínimo) · **axe:** `color-contrast` [serious] — **60 nós em 26 medições** (Claro: 34 /
  Escuro: 26; maior concentração em Catálogo, `/sla` e War Room).
- **Passos para reproduzir:** login local → `/?view=catalog`, `/sla`, `/?view=warroom` e `/?view=sentiment` → os
  selos de estado abaixo ficam abaixo de 4,5:1 (texto normal) / 3:1 (texto grande).
- **Evidência (valores medidos pelo axe, sem imagem):**

  | Selo/classe | Contraste medido | Exemplo de HTML |
  |---|---|---|
  | `.bg-warning\/8.text-warning` | **1,98:1** | `<div class="p-3 rounded-xl border text-xs leading-snug bg-warning/8 border-warning/25 text-warning">Não foi po…` |
  | `.bg-destructive\/10` | **3,22:1** | `<div class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold …">` |
  | `.bg-destructive\/8 > .font-semibold` | **3,52:1** | `<p class="font-semibold">Catálogo PromoGifts indisponível para os agentes</p>` |
  | `.bg-destructive` | **3,78:1** | selo cheio (branco sobre `#ef4343`) |
  | `.text-destructive` | **3,78:1** | `<span class="text-destructive">0 críticos</span>` |
  | `.bg-success\/20` | **4,00–4,04:1** | `<div class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold …">` |
  | `#radix-… > span` (rótulo de menu em portal) | **1,01 / 1,05 / 1,06:1** | `<span>Multiplix</span>`, `<span>Telefonia</span>` |
- **Arquivo provável:** causas (a) selos de estado do grupo — `src/components/catalog/CatalogRail.tsx`
  (`Ocultar alerta de sincronização`/estoque), `src/components/dashboard/SentimentAlertsDashboard.tsx`,
  `src/components/queues/SLAAgentTable.tsx`/`SLAMetricCards.tsx` e `catalogShared.tsx` — usam
  `bg-<token>/8..20` com `text-<token>` puro; (b) rótulos de menu dentro de portal Radix com cor igual ao fundo,
  provável causa no casco (`src/components/layout/Sidebar.tsx`), medido mas **não isolado** — o alvo é um `span`
  dentro de `#radix-*` e casa com o estado de rótulo oculto da navegação.
- **Correção sugerida:** usar os pares já existentes no sistema (token cheio com `text-* -foreground` em vez de
  `bg-token/8` + `text-token`), sem criar cor nova; no casco, esconder o rótulo do menu com `sr-only`/`aria-hidden`
  em vez de deixá-lo com a cor do fundo. **Esforço: P/M** (parte (b) no casco → cartão próprio).

### A11Y-CATALOGO_FILAS_SLA-05 — Hierarquia de cabeçalhos inválida (h3 antes de h1/h2) · **P2**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate] — **27 nós em 27 medições**.
- **Telas:** Catálogo (grade, lista, seleção em massa), Filas, detalhe da fila, War Room e alertas.
- **Passos para reproduzir:** login local → `/?view=catalog` (aba Produtos) ou `/?view=queues` → executar axe.
- **Evidência:** alvo `h3` → `<h3 data-orientation="vertical" data-state="closed" class="flex">` (gatilho do
  acordeão do rail, `ExternalProductManagement.tsx:1017`) e alvo `…nth-child(2) > h3` →
  `<h3 class="font-semibold tracking-tight text-lg text-foreground">Fila Geral</h3>` (título do card de fila).
- **Arquivo provável:** `src/components/catalog/ExternalProductManagement.tsx:1017` (Accordion do rail),
  `src/components/queues/QueueCard.tsx` (título do card), `src/components/queues/QueuesView.tsx:79`
  (`<h2>Alertas Ativos</h2>` depois de `h3`), `src/components/dashboard/SentimentAlertsDashboard.tsx` (`h3` "Evolução Diária").
- **Correção sugerida:** um `h1` por tela e `h2` para seções, deixando `h3` só dentro de um `h2`; no rail do
  catálogo, `h2` para o grupo e `h3` para os itens. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-06 — Telas sem `<h1>` e sem `<main>` · **P2**
- **WCAG:** 1.3.1 / 2.4.1 / 2.4.6 · **axe:** `page-has-heading-one` [moderate] **10 nós/10 medições**;
  `landmark-one-main` [moderate] **8 nós/8 medições**.
- **Telas:** `/sla` (2 medições), `/sla/history` (2), `/queues/comparison` (2) e os estados com o menu do card
  aberto (o `aria-hidden` do fundo esconde o `h1`/`main`).
- **Passos para reproduzir:** login local → `/sla` → executar axe: o topo é um `h2`.
- **Evidência:** `/sla` → `html` sem `h1` e topo `<h2 class="text-2xl font-bold">Dashboard de SLA</h2>`
  (`src/components/queues/SLADashboard.tsx:119`); `/sla/history` → `H2: Histórico de Violações SLA`;
  `/queues/comparison` → `html` (documento sem `main`).
- **Arquivo provável:** `src/components/queues/SLADashboard.tsx:119`, página `src/pages/SLAHistory.tsx`,
  `src/pages/QueuesComparison.tsx` / `src/components/queues/QueuesComparisonDashboard.tsx`.
- **Correção sugerida:** promover o título para `h1` e envolver o conteúdo em `<main>` (as telas do casco já têm
  `main`; estas páginas standalone não passam pelo casco). **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-07 — Conteúdo fora de landmark (portais Radix e telas standalone) · **P2**
- **WCAG:** 1.3.1 · **axe:** `region` [moderate] — **236 nós em 39 medições**.
- **Telas:** `/queues/comparison` (118 nós), `/queue/:id` (56), `/sla` (16) e `/sla/history` (14), War Room (12),
  Catálogo (9, só no desktop: o popover do `Select` fica em portal).
- **Passos para reproduzir:** login local → `/queues/comparison` (ou `/queue/<id>`) → executar axe.
- **Evidência:** alvo `:root` → `<div data-radix-popper-content-wrapper="" style="position: fixed; lef…">`
  (conteúdo de popover em portal fora de qualquer landmark) e `html` → *"Some page content is not contained by landmarks"*
  nas duas páginas standalone.
- **Arquivo provável:** `src/components/ui/select.tsx`/`dropdown-menu.tsx` (portais) e as páginas
  `src/pages/QueuesComparison.tsx`, `QueueDetails.tsx`, `SLAHistory.tsx` (conteúdo sem `<main>`); no detalhe da fila,
  os cards de estatística ficam fora de landmark.
- **Correção sugerida:** envolver o conteúdo de cada página em `<main>`/`<section aria-label>` e, quando o popover
  for informativo, dar `aria-label` ao wrapper; para menus/listboxes do Radix, aceitar o papel nativo e tirar o
  wrapper da checagem (documentando a exceção). **Esforço: M**.

### A11Y-CATALOGO_FILAS_SLA-08 — Skip links focáveis dentro de região `aria-hidden` com o menu do card aberto · **P2**
- **WCAG:** 4.1.2 / 2.4.3 · **axe:** `aria-hidden-focus` [serious] — **26 nós em 4 medições**.
- **Tela/viewport:** `/?view=queues` com o menu "Ações da fila" aberto, nos 4 combos.
- **Passos para reproduzir:** login local → `/?view=queues` → abrir "Ações da fila" → executar axe; o fundo recebe
  `aria-hidden` mas mantém conteúdo focável.
- **Evidência:** alvo `.skip-links-container` →
  `<nav class="skip-links-container" aria-label="Links de navegação rápida" role="navigation" data-aria-hidden="true" aria-hidden="true">`;
  falha: *"Focusable content should have tabindex=\"-1\" or be removed from the DOM"*.
- **Arquivo provável:** o container de skip links do casco (`src/components/layout/**`, `skip-links-container`) —
  o mesmo padrão já registrado no Y15 (Telefonia/Talk X); aqui ele aparece pela primeira vez **no grupo de Filas**,
  disparado pelo menu do card.
- **Correção sugerida:** ao aplicar `aria-hidden` numa raiz (overlay/menu), remover o foco dos links internos
  (`tabIndex={-1}`) ou mover os skip links para fora da região ocultada. **Esforço: M** (casco).

### A11Y-CATALOGO_FILAS_SLA-09 — Campos do diálogo "Metas e Alertas" sem rótulo programático · **P2**
- **WCAG:** 1.3.1 / 4.1.2 / 2.4.6 · **axe:** `label` [critical] **16 nós/4 medições** +
  `aria-input-field-name` [serious] **16 nós/4 medições**.
- **Tela/viewport:** `/?view=queues` → card → "Metas e Alertas", nos 4 combos.
- **Passos para reproduzir:** login local → `/?view=queues` → menu do card → "Metas e Alertas" → executar axe.
- **Evidência:** alvo `input[value="10"]` → `<input class="flex rounded-xl bord…" type="number" value="10">`
  (*"Element does not have an implicit (wrapped) \<label\>"*); alvo `span[aria-valuemax="50"]` →
  `<span role="slider" aria-valuemin="1" aria-valuemax="50" aria-orientation="horizontal" …>`
  (*"aria-label attribute does not exist or is empty"*).
- **Arquivo provável:** `src/components/queues/QueueGoalsDialog.tsx:100-118, 134-152, 168-186, 202-220` — os
  `<Label>` não têm `htmlFor` (nem os `Slider`/`input type="number"` um `id`/`aria-label`).
- **Correção sugerida:** `htmlFor`/`id` ligando `Label` ↔ `input`, e `aria-label` (ou `aria-labelledby`) nos quatro
  `Slider`. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-10 — Cabeçalho de tabela vazio no detalhamento por fila · **P3**
- **WCAG:** 1.3.1 · **axe:** `empty-table-header` [minor] — **4 nós/4 medições** (`/queues/comparison`).
- **Passos:** login local → `/queues/comparison` → rolar até "Detalhamento por Fila" → executar axe.
- **Evidência:** alvo `.text-left:nth-child(9)` → `<th class="h-12 px-4 text-left align-middle font-semibold text-xs uppercase tracking-wider text-muted-foregrou…">`
  (*"Element does not have text that is visible to screen readers"*).
- **Arquivo provável:** `src/components/queues/QueuesComparisonDashboard.tsx:231` — `<TableHead></TableHead>` (coluna de ações).
- **Correção sugerida:** `<TableHead><span className="sr-only">Ações</span></TableHead>`. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-11 — Alvos de toque abaixo de 44 px (celular) · **P3**
- **WCAG:** 2.5.5 (AAA/prática móvel) e a régua de 44 px pedida no cartão.
- **Telas:** todas as 16 em `390×844` (o casco é comum a todas).
- **Passos para reproduzir:** login local em `390×844` → medir `getBoundingClientRect()` dos alvos visíveis.
- **Evidência (contagem nas 64 medições × tamanho):**
  - casco (`src/components/layout/Sidebar.tsx`): itens de navegação **38×38** (28 medições cada: Catálogo, Chat,
    Contatos, Email, Multiplix, Notificações…), `Expandir menu` `w-[38px] h-[38px]` (`Sidebar.tsx:111`) **38×38** (28);
  - casco móvel (`src/components/mobile/MobileHeader.tsx:76,131`): `Abrir menu`, `Buscar`, `Notificações` **40×40** (22 cada);
  - grupo: `QueueCard.tsx:39` (menu, `w-8 h-8`) e `QueueCard.tsx:85` (adicionar membro, `w-8 h-8`) **32×32**;
    abas do Catálogo (`Produtos/Favoritos/Enviados`) com **28 px de altura** (125×28 medidos);
    botões `size="icon"` do grupo em 32/36/40 px; ações de linha da tabela de SLA `w-8 h-8`.
- **Correção sugerida:** no casco, elevar barra/menu para `h-11`/44 px (ou aumentar a área clicável com padding sem
  crescer o ícone) — **tratar em cartão próprio do casco** (colide com outros grupos); no grupo, subir os controles
  de card e as abas para 44 px no mobile. **Esforço: M**.

### A11Y-CATALOGO_FILAS_SLA-12 — Texto cortado em botões no celular · **P3**
- **WCAG:** 1.4.4 / 1.4.10 (texto cortado sem possibilidade de leitura) · medidor próprio (`scrollWidth > clientWidth`
  com `overflow-x: hidden`).
- **Telas/viewport:** War Room, `/sla` e `/queues/comparison` em `390×844`.
- **Evidência (medida visível × conteúdo):** `button «Balancear Carga» 128 vs 132–135` e
  `button «Reatribuir Ausentes» 128 vs 140–144` (War Room), `button «Histórico» 103 vs 108–111` (`/sla`),
  `button «Ver todos» 108 vs 113` (`/queues/comparison`).
- **Arquivo provável:** `src/components/dashboard/WarRoomDashboard.tsx` (barra de ações do painel),
  `src/components/queues/SLADashboard.tsx:125-131` (botão "Histórico"), `QueuesComparisonDashboard.tsx` ("Ver todos").
- **Correção sugerida:** permitir quebra do rótulo (`whitespace-normal`) ou esconder o texto no mobile mantendo
  `aria-label`; dar `min-w-0`/`shrink` aos botões da barra. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-13 — HTML inválido: `<li>` aninhado no breadcrumb do cabeçalho de página · **P3**
- **WCAG:** 1.3.1 / 4.1.1 (estrutura válida) · evidência: erro de console do próprio navegador.
- **Telas:** todas as que usam o cabeçalho de página com breadcrumb — medido em `/queue/4daa900c-…` (Fila Geral).
- **Passos para reproduzir:** login local → abrir `/queue/<id>` → console do navegador:
  `[vite] (client) [console.error] <li> cannot contain a nested <li>.` (registrado às 07:04:03 e 07:12:52 em `.tmp/auditoria.log`).
- **Evidência de código:** `src/components/layout/PageHeader.tsx:103-121` renderiza `<BreadcrumbItem>` (que é `<li>`,
  `src/components/ui/breadcrumb.tsx:29`) com `<BreadcrumbSeparator>` (`<li>`, `breadcrumb.tsx:62`) dentro.
- **Correção sugerida:** renderizar o separador fora do `<li>` (irmão) ou trocar por `<span role="presentation" aria-hidden>`
  — o componente já usa `aria-hidden="true"` no separador quando é `li`. **Esforço: P**.

### A11Y-CATALOGO_FILAS_SLA-14 — Nome acessível do botão de fechar diálogo em inglês · **P3**
- **WCAG:** 3.1.1 (Idioma da página/parte) · verificado no código; não é falha de axe.
- **Evidência:** `src/components/ui/dialog.tsx:72` → `<span className="sr-only">Close</span>` no botão de fechar, com o
  app todo em pt-BR; leitor de tela anuncia "Close" nos diálogos do grupo (medido em "Nova Fila" e "Metas e Alertas").
- **Correção sugerida:** trocar por `Fechar`. **Esforço: P** (casco/UI).

## 6. Resumo por severidade

| Severidade | Achados | IDs |
|---|---:|---|
| **P0** | 0 | — |
| **P1** | 4 | 01, 02, 03, 04 |
| **P2** | 5 | 05, 06, 07, 08, 09 |
| **P3** | 5 | 10, 11, 12, 13, 14 |
| **Total** | **14** |  |

## 7. Resumo por tela (nós de violação do axe nas 64 medições e achados)

| Tela/estado | Nós axe | Regras principais | Achados |
|---|---:|---|---|
| Catálogo (grade) | 19 | `button-name`, `color-contrast`, `heading-order`, `region` | 01, 04, 05, 07, 11 |
| Catálogo (filtros) | 5 | `color-contrast` | 04, 11 |
| Catálogo (modo lista) | 18 | `button-name`, `color-contrast`, `heading-order`, `region` | 01, 04, 05, 07, 11 |
| Catálogo (seleção em massa) | 18 | `button-name`, `color-contrast`, `heading-order`, `region` | 01, 04, 05, 07, 11 |
| Catálogo (favoritos) | 15 | `button-name`, `color-contrast`, `heading-order`, `region` | 01, 04, 05, 07 |
| Filas (lista) | 16 | `button-name`, `color-contrast`, `heading-order`, `region` | 01, 04, 05, 11 |
| Filas (menu do card) | 41 | `aria-hidden-focus`, `landmark-one-main`, `page-has-heading-one`, `region` | 06, 08, 11 |
| Filas (Nova Fila) | 32 | `button-name` | 01, 11 |
| Filas (Metas e Alertas) | 39 | `aria-input-field-name`, `label`, `button-name` | 01, 09, 11, 14 |
| Filas (comparação) | 142 | `region` (118), `button-name`, `empty-table-header`, `landmark-one-main` | 01, 03, 06, 07, 10, 11, 12 |
| Fila (detalhe) | 60 | `region` (56), `heading-order` | 05, 07, 11, 13 |
| Fila (Configurar) | 1 | `color-contrast` | 04, 11 |
| SLA (dashboard) | 84 | `button-name` (36), `region`, `color-contrast`, `aria-progressbar-name`, `page-has-heading-one` | 01, 02, 04, 06, 11 |
| SLA (histórico) | 24 | `color-contrast`, `region`, `page-has-heading-one`, `landmark-one-main`, `heading-order` | 02, 04, 05, 06, 07 |
| War Room (painel) | 48 | `aria-progressbar-name` (24), `button-name`, `region`, `heading-order` | 01, 02, 04, 05, 11, 12 |
| War Room (alertas) | 21 | `button-name`, `heading-order`, `color-contrast`, `region` | 01, 04, 05, 11 |
| **Total** | **583** |  |  |

## 8. Todos os caminhos pesquisados no código atual

Guardados em `.tmp/git-grep-caminhos.txt` (rodados neste workspace, base `3019e406c`):

- `git grep -n 'size="icon"' -- src/components/queues src/components/dashboard/war-room src/components/dashboard/SentimentAlertsDashboard.tsx src/components/dashboard/WarRoomDashboard.tsx src/components/catalog` — 21 sítios; a maioria sem `aria-label`/`title` (achado 01).
- `git grep -c 'aria-label\|title=' -- src/components/queues/QueueCard.tsx` → **1** ocorrência (só o menu), confirmando os botões sem nome.
- `git grep -n 'shadow-glow-accent-sm' -- src` → só `src/components/ui/button.tsx:17` (variante `ghost`), o que liga os alvos `.hover\:shadow-glow-accent-sm` do axe aos botões `ghost` do grupo.
- `git grep -n '<Progress' -- src/components/queues src/components/dashboard src/components/catalog` → 12 sítios sem nome (achado 02).
- `git grep -n 'Slider\|type="number"\|Label' -- src/components/queues/QueueGoalsDialog.tsx` → `Label` sem `htmlFor` e `Slider` sem nome (achado 09).
- `git grep -n 'TableHead\|<th' -- src/components/queues/QueuesComparisonCharts.tsx src/components/queues/QueuesComparisonDashboard.tsx` → `TableHead` vazio em `:231` (achado 10).
- `git grep -n 'aria-label="Expandir menu"' -- src` → `src/components/layout/Sidebar.tsx:111` com `w-[38px] h-[38px]` (achado 11).
- `git grep -n 'BreadcrumbSeparator\|BreadcrumbItem\|BreadcrumbPage' -- src/components/layout/PageHeader.tsx src/components/ui/breadcrumb.tsx` → `li` aninhado (achado 13).
- `git grep -n 'w-\[200px\]' -- src` e `git grep -n 'SelectTrigger' -- src/components/catalog` → gatilhos do Catálogo (achado 01).
- `git grep -n 'text-foreground-secondary' -- src/components/{catalog,queues,dashboard}` → uso massivo do token (achado 04, com o mesmo padrão de contraste já registrado no Y15).

## 9. Provas executadas

1. `zapp-db-local up "$PWD" y17a11ycatalogo` → `migrations: 786 ok, 21 falha(s) de 809 | seed: ok | 347s`,
   `TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)`, `EXIT=0` (`.tmp/db-up.log:1,49,50`).
2. Inventário das 8 rotas do grupo em navegador real (login admin local) →
   `zapp-e2e-local … inventario.spec.ts` → **1 passed (48.7s)**, `.tmp/a11y-audit-local/inventario.json` (68 KB).
3. Medição principal → `zapp-e2e-local "$PWD" y17a11ycatalogo -c .tmp/a11y-audit-local/playwright.local.config.ts auditoria-a11y.spec.ts`
   → **1 passed (24.1m)**, `EXIT=0`; `.tmp/a11y-audit-local/resultados.jsonl` com **64** linhas.
4. Agregações sobre o `resultados.jsonl` (jq): 16 telas distintas; viewports `390x844`/`1280x800`; temas `light`/`dark`;
   `overflow` verdadeiro em **2** medições; `foco.semIndicador` = **0**; violações somando **583 nós** (tabela da seção 3).
5. Corroboração do próprio app (`src/main.tsx` roda axe em dev): 21× `CRITICAL: button-name`,
   12× `MODERATE: heading-order`, 10× `SERIOUS: color-contrast` no `.tmp/auditoria.log` das 64 navegações.
6. `git grep` dos caminhos (seção 8) gravado em `.tmp/git-grep-caminhos.txt`.
