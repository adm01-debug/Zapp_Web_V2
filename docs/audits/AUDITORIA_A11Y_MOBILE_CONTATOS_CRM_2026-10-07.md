# AUDITORIA A11Y E CELULAR — Contatos, CRM 360° e SalesView (Y14)

Especialista: worker (testes) (area-testes-do-produto)

- **Data:** 2026-10-07 · **Cartão:** t_ed29ba06 (Y14) · **Plano:** `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo de telas:** lista de Contatos (cartões/lista/tabela/pipeline/mapa/analytics), painel de detalhe do contato, formulário de contato, painel de filtros avançados, CRM 360° (7 abas de tabela + paginação) e SalesView/propostas (aba da conversa) + aba CRM 360° da conversa.

## 1. Método (o que foi realmente executado)

| Item | Valor |
|---|---|
| App | build de desenvolvimento do PRÓPRIO workspace (`bun run dev`, Vite, `127.0.0.1:5199`, `VITE_CRM_INTEGRATION_ENABLED=true`) |
| Sessão | FALSA, injetada no `localStorage` por `installFakeSession` (usuário `admin` sintético). Nenhum login real. |
| Backend | 100% mockado por `page.route` (identidade, `feature_flags`, `search_contacts`, `contacts_count_by_type`, `messages`, `crm-integration`). Toda a rede real cai em `bloquearRedeReal` (403). |
| Dados | sintéticos (3 contatos: 1 cliente, 1 fornecedor, 1 transportadora). Nenhum dado de cliente, telefone real, CPF/CNPJ ou URL de produção. |
| Viewports | **390×844** e **1280×800** |
| Temas | **claro** e **escuro** (`localStorage.theme` antes do boot) |
| Ferramenta | Playwright 1.56 (Chromium), axe-core 4.13 (`axe.run`, `resultTypes: ['violations']`, catálogo completo) |
| Medições por tela | axe; rolagem horizontal; alvos de toque; nome acessível; ordem de tabulação (18 `Tab`) + anel de foco; diálogos (caber na viewport) |
| Resultado da rodada final | `4 passed (2.8m)` — 31 medições de axe + 31 de rolagem/alvos/nomes/foco, **0 erro de medição** |
| Harness | spec temporário em `.tmp/a11y-audit/y14.spec.ts` (fora do git; **removido antes do commit** para o diff ficar só neste `.md`). Cópia + dados brutos anexados ao cartão. |
| Dados brutos | `.tmp/a11y-audit/dados.jsonl` (169 registros) e resumos `resumo.txt`/`matriz.txt` (anexados ao cartão) |

### Limitações honestas (o que NÃO foi medido)
1. **Teclado virtual** cobrindo campos: não é simulável no headless. Verificado apenas o que dá para afirmar: os diálogos do grupo cabem na viewport e o painel de detalhe tem `ScrollArea` interna (`ContactDetailPanel.tsx:341`). Os formulários do CRM 360° usam `max-h-[85vh]` + `ScrollArea` `max-h-[60vh]` — com a viewport reduzida pelo teclado, 85vh continua sendo recalculado pelo navegador, mas isso **não foi exercitado**.
2. **Mapa**: a requisição do estilo do Mapbox é bloqueada pelo guarda de rede (403) — a tela de mapa foi medida em estado degradado (sem tiles, com botão "Tentar novamente"). Os achados de DOM/ARIA dela valem; a avaliação visual do mapa, não.
3. **Painel de filtros avançados em 390×844**: em 1 das 4 combinações (390 claro) o painel não abriu no harness (timeout de clique no gatilho, com o mesmo seletor que funciona nas outras 3). Registrado como limitação do harness, não como achado.
4. **Textos cortados**: não há verificador genérico de truncamento no harness; foi feito por inspeção das classes do grupo (ver §4.4), não por medição.

## 2. Cobertura

| Tela | 390×844 claro | 390×844 escuro | 1280×800 claro | 1280×800 escuro |
|---|---|---|---|---|
| Contatos — lista | ✔ | ✔ | ✔ | ✔ |
| Contatos — filtros avançados | ✖ (limitação) | ✔ | ✔ | ✔ |
| Contatos — painel de detalhe | ✔ | ✔ | ✔ | ✔ |
| Contatos — formulário (novo contato) | ✔ | ✔ | ✔ | ✔ |
| Contatos — mapa | ✔ | ✔ | ✔ | ✔ |
| CRM 360° (view) | ✔ | ✔ | ✔ | ✔ |
| SalesView (aba da conversa) | ✔ | ✔ | ✔ | ✔ |
| CRM 360° (aba da conversa) | ✔ | ✔ | ✔ | ✔ |

## 3. Achados

### A11Y-CONTATOS_CRM-01 — Menu de ações de cada contato sem nome acessível  · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) / 1.3.1 · **axe:** `button-name` [critical]
- **Telas:** Contatos — lista e painel de detalhe · **390×844 e 1280×800**, claro e escuro — **3 nós** (um por cartão renderizado)
- **Passos:** abrir `?view=contacts` → os cartões ficam em `[data-testid="contact-card"]`; o gatilho do menu (`MoreVertical`) não tem texto, `aria-label`, `aria-labelledby` nem `title`.
- **Evidência (axe):** `#radix-_r_77_` → `<button class="inline-flex items-ce..." type="button" id="radix-_r_77_" aria-haspopup="menu" aria-expanded="false" data-state="closed">` — "Element does not have inner text that is visible to screen readers / aria-label attribute does not exist or is empty".
- **Arquivo provável / TODOS os caminhos do mesmo defeito** (`git grep`):
  - `src/components/contacts/ContactCard.tsx:70` (`<Button variant="ghost" size="icon" className="w-8 h-8">` + `<MoreVertical/>`)
  - `src/components/contacts/ContactListItem.tsx:154` (mesmo padrão, `w-9 h-9`)
  - `src/components/contacts/ContactsTable.tsx:224` (mesmo padrão, `w-7 h-7`)
- **Correção sugerida:** `aria-label={`Ações de ${contact.name}`}` no `Button` dos três arquivos (ou `title` equivalente + `sr-only`). **Esforço: P**

### A11Y-CONTATOS_CRM-02 — Abas da conversa (inclui **SalesView**) sem nome acessível abaixo de 1536 px · **P1**
- **WCAG:** 4.1.2 / 2.4.6 · **axe:** `button-name` [critical] em `role="tab"`
- **Telas:** SalesView e CRM 360° (aba da conversa) · **390×844 e 1280×800**, claro e escuro — **8 nós** por tela (Chat, Arquivos, IA, CRM 360°, **SalesView**, Journey, Tarefas, Notas)
- **Passos:** abrir um contato pelo botão "Conversar" do cartão (ou qualquer conversa) → barra `[data-testid="conversation-tabs"]`; em < 1536 px o rótulo está em `<span class="hidden 2xl:inline">` e o botão não tem `aria-label`, então a única coisa que sobra é o ícone.
- **Evidência (axe):** `button[data-testid="conversation-tab-orders"]` → `<button role="tab" aria-selected="false" data-testid="conversation-tab-orders" class="relative isolate h-9...">`; idem `conversation-tab-crm`, `-chat`, `-files`, `-ia`, `-history`, `-tasks`, `-notes`.
- **Arquivo provável:** `src/components/inbox/chat/ConversationTabs.tsx:62-88` (botão `role="tab"` sem `aria-label`; rótulo escondido por breakpoint)
- **Correção sugerida:** `aria-label={tab.label}` no botão da aba (mantendo o texto visível só a partir de `2xl`). É o portão de entrada do grupo SalesView: hoje um leitor de tela anuncia 8 abas sem nome. **Esforço: P**

### A11Y-CONTATOS_CRM-03 — `Select`s sem nome acessível nos filtros de Contatos e na paginação do CRM 360° · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `button-name` [critical] em `role="combobox"`
- **Telas:** Contatos — filtros avançados (**7 nós**), CRM 360° (**4 nós**, sendo 1 o seletor de itens por página)
- **Passos:** `?view=contacts` → botão `Filtros` (`aria-controls="contact-filters-panel"`); `?view=crm360` → tabela ativa.
- **Evidência (axe):** 
  - filtros: `.space-y-2:nth-child(1..5) > .rounded-md.border-input...` → `<button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" ...>` sem nome;
  - CRM 360°: `.\[&>span\]:line-clamp-1` → `<button type="button" role="combobox" ... data-state="closed">` (paginador 10/25/50/100).
- **Arquivo provável / todos os caminhos:**
  - `src/components/contacts/ContactAdvancedFilters.tsx:90, 106, 122, 138, 157` (`<SelectTrigger>` sem `aria-label`; só `placeholder` no `SelectValue`, que não nomeia o gatilho)
  - `src/components/crm360/DataExplorerTable.tsx:83-91` (`<SelectTrigger className="w-[80px] h-9">`)
  - contraste com o que já está certo: `ContactToolbar.tsx:95` usa `aria-label="Ordenar por"` — o mesmo padrão resolve aqui.
- **Correção sugerida:** `aria-label` em cada `SelectTrigger` ("Filtrar por empresa", "Filtrar por cargo", "Filtrar por etiqueta", "Período", …; "Itens por página" no CRM 360°). **Esforço: P**

### A11Y-CONTATOS_CRM-04 — Botões só de ícone do CRM 360° sem nome acessível (atualizar, paginação, limpar busca) · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **4 nós** no CRM 360°
- **Passos:** `?view=crm360` → cabeçalho da tabela (busca/atualizar) e rodapé (página anterior/próxima).
- **Evidência (axe):** `.hover\:border-secondary\/50.hover\:shadow-glow-secondary-sm...:nth-child(4)` → `<button class="inline-flex items-ce...">` (botão de atualizar) e `.px-2.h-7...:nth-child(1)` → `<button class="inline-flex items-ce..." disabled="">` (página anterior; o próximo é `nth-child(2)`). Com texto de busca preenchido, o `X` de limpar entra no mesmo conjunto.
- **Arquivo provável / todos os caminhos:** `src/components/crm360/DataExplorerTable.tsx:75-77` (limpar busca), `:92-94` (atualizar), `:157` e `:158` (anterior/próxima). Os cabeçalhos de coluna clicáveis (`:113-121`) são o mesmo tipo de controle sem alternativa de teclado (ver A11Y-CONTATOS_CRM-10).
- **Correção sugerida:** `aria-label="Atualizar"`, `"Página anterior"`, `"Próxima página"`, `"Limpar busca"`. **Esforço: P**

### A11Y-CONTATOS_CRM-05 — Contraste abaixo de 4,5:1 no tema CLARO (textos explicativos e ações primárias) · **P2**
- **WCAG:** 1.4.3 · **axe:** `color-contrast` [serious] — **10 ocorrências** de grupo
- **Telas/combos:** Contatos — mapa (390 e 1280 claro, 3 nós); CRM 360° (2 nós, claro); CRM 360° da conversa (1280 claro 6 nós / 1280 escuro 7 nós / 390 escuro 4 nós); SalesView (1280 claro 5 nós); Contatos — filtros (1280 claro 1 nó)
- **Evidência (axe, amostras):**
  - `.text-muted-foreground\/70.text-3xs` → `<p class="text-3xs text-muted-foreground/70">Posição aproximada pela região do DDD, não pelo endereço do cliente.</p>`
  - `.px-1\.5` / `.px-2\.5` → badges do CRM 360° com **3,3:1** (`foreground #e2ebf3` sobre fundo claro)
  - `section:nth-child(1..3) > header ... > .hover\:underline.text-primary` → `<button class="text-xs font-medium text-primary hover:underline">Editar</button>` / `"Ver funil →"` / `"Ver no SalesView →"`
  - `.hover\:bg-primary\/25` → `<button class="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold ...">Criar negociação</button>`
  - `[data-testid="conversation-item"] ... > .gap... > span` → `<span>SLA</span>` (selo do item de conversa)
  - `.text-\[8px\]` → `<div class="w-5 h-5 text-[8px] ... bg-info/15 text-info rounded-full" title="Brindes Promocionais LTDA">` (avatar de empresa)
- **Arquivo provável:** `src/components/crm360/CRM360StatsCards.tsx`, `src/components/crm360/DataExplorerTable.tsx` (badge RFM), `src/components/inbox/tabs/SalesViewTab.tsx` (cabeçalhos/links `text-primary` sobre `bg-card`), `src/components/inbox/tabs/CommercialSummaryStrip.tsx` / `OpenDealsList.tsx` ("Criar negociação", "Ver funil →"), `src/components/contacts/ContactMapView.tsx` (aviso de posição aproximada). Confirmar tom a tom com o `text-primary`/`bg-primary/15` do tema claro.
- **Correção sugerida:** usar a variante sólida do token (`text-primary` sobre `bg-primary/15` → `text-primary-strong`/`bg-primary text-primary-foreground`, ou reduzir a opacidade só no fundo), e trocar `text-muted-foreground/70` por `text-muted-foreground`. **Esforço: M** (revisão de tokens por tela)

### A11Y-CONTATOS_CRM-06 — `aria-controls` das abas de tipo de contato aponta para id inexistente · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-valid-attr-value` [critical] — **1 nó** em todas as medições de Contatos (lista, filtros, detalhe, mapa; 4 combos)
- **Passos:** `?view=contacts` → abas de tipo (`Todos`, `Cliente`, …).
- **Evidência (axe):** `#radix-_r_6a_-trigger-all` → `<button type="button" role="tab" aria-selected="true" aria-controls="radix-_r_6a_-content-all" ...>` — "Invalid ARIA attribute value: aria-controls=`radix-_r_6a_-content-all`" (o elemento referenciado não existe no DOM: só o conteúdo da aba ativa é montado).
- **Arquivo provável (confirmado):** `src/components/contacts/ContactTypeTabs.tsx:3,44-78` — usa `Tabs`/`TabsList`/`TabsTrigger` do Radix e **não renderiza nenhum `TabsContent`**: as abas filtram a mesma lista, então o `aria-controls` gerado pelo Radix aponta para um id que nunca existe. `git grep -n "TabsTrigger" -- src/components/contacts` devolve só este arquivo (as demais abas do grupo vêm de `ContactViewSwitcher`/`ConversationTabs`, que não usam Radix `Tabs`).
- **Correção sugerida:** como não há painel por aba, trocar o `Tabs` por um grupo de botões (ou manter o Radix e montar um `TabsContent` oculto com a lista) — assim o `aria-controls` não fica pendurado. **Esforço: P**

### A11Y-CONTATOS_CRM-07 — Alvos de toque abaixo de 24×24 px (WCAG 2.5.8 AA) no grupo · **P2**
- **WCAG:** 2.5.8 (Tamanho do alvo — mínimo, AA) · medição própria (largura × altura do `getBoundingClientRect`)
- **Telas:** Contatos (lista, detalhe, formulário, mapa), CRM 360°, SalesView/CRM 360° da conversa
- **Evidência (excertos medidos):**
  - `button.peer.h-4.w-4` → **16×16** (`Selecionar Ana Roberta Nogueira da Silva`, checkbox do cartão — `ContactCard.tsx`)
  - `button.peer.shrink-0.border` → **18×18** (checkbox "Selecionar todos" — `ContactResultsSummary.tsx:43`)
  - `button.text-xs.font-medium.text-primary` → **73×16 / 89×16 / 75×16 / 104×16** (`Criar tarefa →`, `Ver na jornada →`, `Ver pipeline →`, `Ver no SalesView →`)
  - `button.h-8.px-3.rounded-lg` → **118×32** (`Criar negociação`)
  - `button.mapboxgl-ctrl-zoom-in/-out/-compass` → **32×32** (controles do mapa)
  - `button[data-testid="contact-show-legacy"]` → **44×24** (trilho do Switch)
  - `button.inline-flex.items-center.justify-center` (fechar painel de detalhe, `ContactDetailPanel.tsx:222-228`) → **32×32**
  - `button` de paginação do CRM 360° (`h-7`) → **28 px** de altura
- **Arquivo provável / caminhos:** `src/components/contacts/ContactCard.tsx:57-64`, `src/components/contacts/ContactResultsSummary.tsx:38-56`, `src/components/inbox/tabs/{CommercialSummaryStrip,OpenDealsList}.tsx` (links `text-primary` de 16 px), `src/components/contacts/ContactDetailPanel.tsx:222`, `src/components/crm360/DataExplorerTable.tsx:157-158`. Os controles do Mapbox vêm da biblioteca (`mapbox-gl.css`) — precisa de override de CSS do projeto.
- **Correção sugerida:** dar área mínima de 24×24 px ao alvo clicável (padding/`min-h`/`min-w` ou `::before` com área estendida) sem mudar o desenho; nos links de texto, aumentar o `py` do botão. **Esforço: M**

### A11Y-CONTATOS_CRM-08 — `role="button"` aninhando controle interativo (axe `nested-interactive`) · **P3**
- **WCAG:** 4.1.2 · **axe:** `nested-interactive` [serious] — 19 ocorrências
- **Telas:** Contatos (lista/detalhe/mapa/filtros, 1 nó) e SalesView/CRM 360° da conversa (1280, 3 nós)
- **Evidência:**
  - `.select-none` → `<div role="button" tabindex="0" class="h-9 flex items-center gap-2 text-sm font-medium cursor-pointer select-none ...">` ("Selecionar todos" com `<Checkbox aria-hidden="true" tabIndex={-1}>` dentro — `ContactResultsSummary.tsx:39-56`). O `aria-hidden` + `tabIndex=-1` já mitiga o foco, por isso P3.
  - `.conversation-row-selected > .gap-3 > [role="button"]` → `<div role="button" tabindex="0" class="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer ...">` (linha da conversa com controles internos — área do Inbox, compartilhada com o cartão Y13).
- **Correção sugerida:** no "Selecionar todos", trocar o `Checkbox` decorativo por `<span aria-hidden>` com o mesmo desenho; na linha de conversa, tirar o `role="button"` do container e deixar o clique no `onClick` com um botão real interno. **Esforço: P**

### A11Y-CONTATOS_CRM-09 — Hierarquia de títulos salta de h1 para h3 nos cartões do CRM 360° · **P3**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate] — 8 ocorrências (CRM 360° e a aba CRM 360° da conversa, nos 4 combos)
- **Evidência (axe):** `h3` → `<h3 class="font-semibold tracking-tight text-sm flex items-center gap-2">` (título do `CardHeader` do `DataExplorerTable`) e `section:nth-child(1) > header ... > h3` → `<h3 class="text-sm font-semibold truncate">Empresa</h3>` (seções do `Crm360Tab`).
- **Arquivo provável:** `src/components/crm360/CRM360ExplorerView.tsx:104` (`CardTitle` renderiza `h3` sem `h2` antes) e `src/components/inbox/tabs/Crm360Tab.tsx` (`SectionCard`).
- **Correção sugerida:** usar `CardTitle` como `h2` (prop `asChild`/`as="h2"`) ou inserir os níveis faltantes. **Esforço: P**

### A11Y-CONTATOS_CRM-10 — Cabeçalhos de coluna ordenáveis sem alternativa de teclado · **P3**
- **WCAG:** 2.1.1 (Teclado) / 4.1.2 · **não coberto pelo axe** (inspeção de código + DOM)
- **Tela:** CRM 360° (todas as abas de tabela)
- **Evidência:** `src/components/crm360/DataExplorerTable.tsx:113-121` — o `<TableHead>` tem `onClick` e `cursor-pointer`, mas **não** é `button`, não tem `tabIndex`, `role` nem `onKeyDown`: a ordenação por coluna só existe para quem usa mouse. (O `arrow-up-down` só aparece depois de ordenar.) Não apareceu em nenhuma medição de axe porque não é um controle focável.
- **Correção sugerida:** envolver o rótulo em `<button>` (mantendo `aria-sort` no `th`) ou adicionar `tabIndex={0}` + `onKeyDown` + `role="button"`. **Esforço: P**

### A11Y-CONTATOS_CRM-11 — Alvos entre 24 e 43 px: prática móvel de 44 px não é atendida nas telas do grupo · **P3**
- **WCAG:** 2.5.5 (AAA) / guia móvel de 44 px · medição própria
- **Evidência (agrupada por seletor, telas em que aparece):**
  - `button[data-testid^="conversation-tab-"]` → **32×36** (abas da conversa, inclui **SalesView**) — 390 e 1280
  - `button.relative.isolate.h-9` (`Cards`/`Lista`/`Tabela`/`Mais visualizações`) → **50×36 / 48×36** — Contatos (todas)
  - `button.inline-flex...justify-center` das abas de tipo (`Todos 129×40`, `Cliente 137×40`, … `Prestador de Serviço 201×40`) → **altura 40** — Contatos (todas)
  - `button.inline-flex...` `Conversar`/`Editar` do cartão e do painel → **36×36**
  - `button.justify-center.rounded-sm.font-medium` (abas de tabela do CRM 360°: `Empresas 101×26`, `Contatos 97×26`, `Tel. Contatos 108×26`, …) → **altura 26**
  - `button` do CRM 360° `Novo` → **84×28**; `RFM` → **57×26**
  - `button` do item de menu lateral (casco, `38×38`) e grupo expansível (`41×30`) — visíveis nestas telas; o mesmo defeito do cartão **Y18** (estrutura geral), citado aqui só para não duplicar cartão.
- **Correção sugerida:** elevar as alturas para 44 px nas barras de aba/view-switcher e nas ações de cartão (as alturas já variam entre 36 e 40 no mesmo componente). **Esforço: M**

## 4. Verificado SEM problema (e como foi verificado)

1. **Rolagem horizontal:** 0 estouros em **31 medições** (`document.documentElement.scrollWidth == clientWidth`: 390/390 e 1280/1280) e 0 elementos fora da largura da viewport com ancestral que não recorta. Vale para Contatos (lista, filtros, detalhe, formulário, mapa), CRM 360° e SalesView nos dois viewports e temas.
2. **Foco de teclado visível:** 18 `Tab` por medição × **31 medições** — **0 elementos focados sem anel** (outline ≥ 1 px ou `box-shadow` presente). Não há, no grupo, controle alcançável por teclado sem indicação visual.
3. **Diálogos cabem na viewport:** formulário de contato **390×812** em 390×844 (rolável) e **512×768** em 1280×800 (rolável); painel de detalhe **380×844 / 380×800** com `ScrollArea` interno (`ContactDetailPanel.tsx:341`). Nenhum diálogo do grupo estourou largura ou altura.
4. **Textos cortados:** `ContactCard.tsx` e `DataExplorerTable.tsx` usam `truncate` **sempre com `title`** no valor completo (ex.: `<span title={String(row[col.key] ?? '')}>`), então o texto encurtado continua acessível por ponteiro. Nada no grupo corta texto sem `title`/`aria-label`.
5. **Contraste no tema ESCURO:** nenhuma violação `color-contrast` nas telas de Contatos (lista, filtros, detalhe, formulário, mapa) nos dois viewports; CRM 360° e SalesView só aparecem no escuro dentro da **aba da conversa** (herdada do painel do Inbox, contabilizada no A11Y-CONTATOS_CRM-05).
6. **Rede real:** só uma requisição escapou dos mocks nos 4 combos — o estilo do Mapbox (`api.mapbox.com/styles/v1/...`), bloqueado de propósito pelo guarda. Nenhuma chamada ao Supabase real: a auditoria correu 100% em dados sintéticos.
7. **Sem erro de medição:** todas as 31 execuções de axe/rolagem/alvos/nomes/foco concluíram (0 exceções no harness).

## 5. Resumo por severidade

| Severidade | Qtde | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 4 | CRM-01, CRM-02, CRM-03, CRM-04 |
| P2 | 3 | CRM-05, CRM-06, CRM-07 |
| P3 | 4 | CRM-08, CRM-09, CRM-10, CRM-11 |
| **Total** | **11** | |

Critérios: **P0** bloquearia o uso da tela; **P1** barra o uso por leitor de tela/teclado em ação central do grupo; **P2** barra ou degrada em condição específica (tema, tamanho de alvo, ARIA inválido); **P3** melhoria de conformidade/prática, sem bloquear.

## 6. Resumo por tela

| Tela | Achados |
|---|---|
| Contatos — lista | 01 (P1), 06 (P2), 07 (P2), 08 (P3), 11 (P3) |
| Contatos — filtros avançados | 03 (P1), 05 (P2), 06 (P2), 11 (P3) |
| Contatos — painel de detalhe | 01 (P1), 06 (P2), 07 (P2), 11 (P3) |
| Contatos — formulário | 07 (P2), 11 (P3) |
| Contatos — mapa | 05 (P2), 06 (P2), 07 (P2), 11 (P3) |
| CRM 360° (view) | 03 (P1), 04 (P1), 05 (P2), 07 (P2), 09 (P3), 10 (P3), 11 (P3) |
| SalesView (aba da conversa) | 02 (P1), 05 (P2), 07 (P2), 08 (P3), 11 (P3) |
| CRM 360° (aba da conversa) | 02 (P1), 05 (P2), 09 (P3), 11 (P3) |

## 7. Contagem bruta do axe (por regra × tela × viewport/tema)

| Regra | impacto | ocorrências | telas (nós por combo) |
|---|---|---|---|
| `button-name` | critical | 24 | Contatos lista (3), Contatos detalhe (5–9), Contatos filtros (7), Contatos mapa (4, só 390 escuro), CRM 360° (4), SalesView (8), CRM 360° da conversa (8) |
| `nested-interactive` | serious | 19 | Contatos lista/detalhe/mapa/filtros (1), SalesView e CRM 360° da conversa (3, em 1280) |
| `aria-valid-attr-value` | critical | 15 | Contatos lista/detalhe/mapa (1 em cada combo) e filtros (1) |
| `color-contrast` | serious | 10 | Contatos mapa (3 claro), CRM 360° (2 claro), CRM 360° da conversa (1–7), SalesView (5, 1280 claro), Contatos filtros (1, 1280 claro) |
| `heading-order` | moderate | 8 | CRM 360° e CRM 360° da conversa (1 em cada combo) |

## 8. O que o cartão de correção deve considerar

- Os quatro P1 são todos **nome acessível** e se resolvem com `aria-label` em 8 arquivos (`ContactCard.tsx`, `ContactListItem.tsx`, `ContactsTable.tsx`, `ConversationTabs.tsx`, `ContactAdvancedFilters.tsx`, `DataExplorerTable.tsx`, `ContactDetailPanel.tsx`, `CRM360ExplorerView.tsx`/`DataExplorerTable.tsx`) — cabe **um** cartão de correção para os P1.
- O P2 de contraste (`CRM-05`) exige decisão de token (claro): cabe ao Claude decidir a variante antes de abrir o cartão, porque muda cor em 4–5 telas.
- `CRM-11` cita também botões do casco (38×38 / 41×30) que são do escopo do cartão **Y18** — não duplicar.
- `CRM-02` e `CRM-08` (linha da conversa) tocam o Inbox do cartão **Y13**; aqui ficam registrados por aparecerem nas telas deste grupo.
