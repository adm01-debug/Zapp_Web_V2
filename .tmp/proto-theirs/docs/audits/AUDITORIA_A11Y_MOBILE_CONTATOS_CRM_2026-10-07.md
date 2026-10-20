Especialista: worker (testes)

# AUDITORIA A11Y E CELULAR — Contatos, CRM 360° e SalesView (Y14)

- **Data:** 2026-10-07 · **Cartão:** t_ed29ba06 (Y14) · **Refazer 1:** t_51c95382 · **Refazer 2:** t_50bf084c (correções só neste relatório) · **Área:** testes do produto (`area-testes-do-produto`) · **Plano:** `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Tipo:** auditoria (RELATÓRIO). **Nenhum arquivo de produto foi alterado**; o único arquivo entregue é este relatório.
- **Escopo de telas:** lista de Contatos (cartões/lista/tabela/pipeline/mapa/analytics), painel de detalhe do contato, formulário de contato, painel de filtros avançados, CRM 360° (7 abas de tabela + paginação) e SalesView/propostas (aba da conversa) + aba CRM 360° da conversa.

### Nesta revisão (refazer 1) — o que mudou neste relatório

1. `A11Y-CONTATOS_CRM-05` **não diz mais "tema CLARO"**: separa 8 grupos no tema claro (23 nós) de 2 grupos no tema escuro (11 nós, ambos na aba CRM 360° da conversa), e a §4.5 afirma exatamente o mesmo.
2. Os nós de `button-name` agora estão **atribuídos a um achado** (§7): os 4 do mapa e os 4 extras do painel de detalhe em 390 escuro são `SelectTrigger` do painel de filtros (CRM-03, que ficou aberto por falha do harness — §1, desvio 2); a §6 recebeu o CRM-03 nessas telas e o CRM-01 passou a cobrir "cartões **e** painel de detalhe" (5 nós por combo = 3 menus + fechar + nota).
3. A **lista de arquivos dos P1** (§8) é só a união dos arquivos citados em CRM-01 a CRM-04, sem duplicata: saíram `CRM360ExplorerView.tsx` (aparece apenas no P3 CRM-09) e a repetição de `DataExplorerTable.tsx`.
4. `text-primary-strong` **não existe** no repositório e saiu da correção de CRM-05: agora só se usam tokens existentes (`--primary-text`, `--destructive-text`, `text-muted-foreground`) e está marcado "confirmar antes de usar" onde não há par de texto (`secondary`, `info`).
5. A linha **Harness** da §1 e o relato dizem a mesma coisa: spec/config seguem em `.tmp/a11y-audit/` como `.txt`, fora do git, **sem** anexo ao cartão. A §1 ganhou o bloco **Desvios declarados** (backend 100% mockado + sessão falsa, no lugar do banco LOCAL com admin local) e cada achado traz a linha **Depende do mock**.

### Nesta revisão (refazer 2) — o que mudou neste relatório

1. **Desvio 2 (§1):** o painel de filtros que ficou aberto no 390 escuro explica apenas os nós extras de `button-name` daquela combinação (os 4 `SelectTrigger`); a menção a `color-contrast` saiu, porque a §7 e a §4.5 mostram **zero** `color-contrast` em Contatos no tema escuro (as 2 ocorrências no escuro são da aba CRM 360° da conversa, contabilizadas no CRM-05).
2. **CRM-07:** o achado passou a listar **só alvos menores que 24 px em alguma dimensão** (checkboxes 16×16 e 18×18 e os links de 16 px de altura). Os alvos que passam do mínimo saíram deste achado e estão no **CRM-11** (o `Switch` e os controles do Mapbox já estavam lá).
3. **§6** foi realinhada às telas do CRM-07: entram `07 (P2)` em Contatos — filtros e em CRM 360° (aba da conversa); saem de CRM 360° (view) e de SalesView, telas que não registram alvo abaixo de 24 px.
4. **§8:** o CRM-07 é classificado como **P2** (não P3) e `ContactMapView.tsx` não é mais associado a ele — o arquivo aparece só no CRM-05.

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
| Resultado da rodada final | `4 passed (2.8m)` — 31 medições de axe + 31 de rolagem/alvos/nomes/foco, **0 erro de medição** (as 2 falhas de *harness* ao abrir/fechar o painel de filtros estão no desvio 2 abaixo) |
| Harness | spec e config preservados como `.txt` em `.tmp/a11y-audit/` (`y14.spec.ts.txt`, `playwright.audit.config.ts.txt`, `diag.spec.ts.txt`) — **fora do git; não foram commitados nem anexados ao cartão**. Cópia idêntica em `.tmp/a11y-audit/` deste cartão (o original ficou no workspace de t_ed29ba06). O diff do cartão traz só este `.md`. |
| Dados brutos | `.tmp/a11y-audit/dados.jsonl` — **169 registros** (31 `axe` + 31 `rolagem` + 31 `alvos` + 31 `nomes` + 31 `foco` + 8 `dialogo` + 2 `nao-abriu` + 4 resumos de rede), fora do git; resumos derivados `resumo.txt`/`matriz.txt` e os `analisa*.py` no mesmo diretório |

### Desvios declarados (medições fora do que o cartão pediu)

1. **Banco e sessão (desvio principal).** A medição rodou com **backend 100% mockado e sessão FALSA** (`installFakeSession`), e **não** com o **banco LOCAL com um admin local** que o cartão pede. Consequência, declarada em cada achado: tudo o que é **estrutura** (nome acessível, ARIA, ordem de foco, tamanho de alvo, hierarquia de títulos, par de cores do tema) vale apesar dos mocks; mas as **contagens de nós** e a **existência de nós que só aparecem quando há dado** (selo `SLA`, avatar de empresa, badges RFM, seções do CRM 360° da conversa, quantos cartões/conversas renderizam) **dependem das respostas mockadas** — os achados de dados do CRM 360° e as contagens de cartões/conversas são os mais afetados.
2. **Painel de filtros em 390×844 (falha do harness, não do produto).** No 390 claro o gatilho `button[aria-controls="contact-filters-panel"]` estourou o timeout de clique e **nenhuma** medição de filtros foi registrada (`nao-abriu`); no 390 escuro o painel **abriu e foi medido**, mas o clique de **fechar** (`y14.spec.ts.txt:347`) estourou o timeout — o painel **ficou aberto** nas telas seguintes. É essa a origem dos nós extras de `button-name` em 390 escuro (§7): os 4 `SelectTrigger` do painel aparecem no mapa e no painel de detalhe. Ela **não** gera nó de `color-contrast`: em Contatos o tema escuro tem **zero** ocorrência dessa regra (§4.5 e §7) — as duas únicas ocorrências no escuro são da aba CRM 360° da conversa (CRM-05).
3. **Amostra do axe.** `axe.run` devolve no máximo **4 nós de amostra por regra** (`v.nodes.slice(0, 4)`, `y14.spec.ts.txt:117`). Onde a amostra sozinha não fecha a conta, a divisão por componente usa o código + o registro `nomes` do próprio harness — e está dito em §7 o que é comprovado pela amostra e o que é inferido.

### Limitações honestas (o que NÃO foi medido)

1. **Teclado virtual** cobrindo campos: não é simulável no headless. Verificado apenas o que dá para afirmar: os diálogos do grupo cabem na viewport e o painel de detalhe tem `ScrollArea` interna (`ContactDetailPanel.tsx:341`). Os formulários do CRM 360° usam `max-h-[85vh]` + `ScrollArea` `max-h-[60vh]` — com a viewport reduzida pelo teclado, 85vh continua sendo recalculado pelo navegador, mas isso **não foi exercitado**.
2. **Mapa**: a requisição do estilo do Mapbox é bloqueada pelo guarda de rede (403) — a tela de mapa foi medida em estado degradado (sem tiles, com botão "Tentar novamente"). Os achados de DOM/ARIA dela valem; a avaliação visual do mapa, não.
3. **Painel de filtros avançados em 390×844**: 1 dos 4 combos (390 claro) nunca foi medido — ver desvio 2. A coluna correspondente da §2 fica marcada como limitação do harness, não como achado.
4. **Textos cortados**: não há verificador genérico de truncamento no harness; foi feito por inspeção das classes do grupo (ver §4.4), não por medição.

## 2. Cobertura

| Tela | 390×844 claro | 390×844 escuro | 1280×800 claro | 1280×800 escuro |
|---|---|---|---|---|
| Contatos — lista | ✔ | ✔ | ✔ | ✔ |
| Contatos — filtros avançados | ✖ (limitação/desvio 2) | ✔ | ✔ | ✔ |
| Contatos — painel de detalhe | ✔ | ✔ | ✔ | ✔ |
| Contatos — formulário (novo contato) | ✔ | ✔ | ✔ | ✔ |
| Contatos — mapa | ✔ | ✔ | ✔ | ✔ |
| CRM 360° (view) | ✔ | ✔ | ✔ | ✔ |
| SalesView (aba da conversa) | ✔ | ✔ | ✔ | ✔ |
| CRM 360° (aba da conversa) | ✔ | ✔ | ✔ | ✔ |

## 3. Achados

### A11Y-CONTATOS_CRM-01 — Botões só de ícone sem nome acessível nos cartões de contato e no painel de detalhe · **P1**
- **WCAG:** 4.1.2 (Nome, Função, Valor) / 1.3.1 · **axe:** `button-name` [critical]
- **Telas:** Contatos — lista (**3 nós** por combo, nos 4 combos: um menu por cartão renderizado) e Contatos — painel de detalhe (**5 nós** por combo, nos 4 combos: os mesmos 3 menus, que continuam no DOM atrás do painel, + 2 botões só de ícone do próprio painel). **41 dos 141 nós** de `button-name` da rodada (§7).
- **Passos:** abrir `?view=contacts` → os cartões ficam em `[data-testid="contact-card"]`; o gatilho do menu (`MoreVertical`) não tem texto, `aria-label`, `aria-labelledby` nem `title`. No painel de detalhe, o botão de fechar (ícone `X`) e o de adicionar nota (ícone `Plus`) estão no mesmo caso.
- **Evidência (axe):** `#radix-_r_77_` → `<button class="inline-flex items-ce..." type="button" id="radix-_r_77_" aria-haspopup="menu" aria-expanded="false" data-state="closed">` — "Element does not have inner text that is visible to screen readers / aria-label attribute does not exist or is empty"; e `.right-3.top-3.hover\:shadow-glow-accent-sm` → `<button class="inline-flex items-ce...">` (botão de fechar do painel). O 5º nó (o `Plus` das notas) não cabe na amostra de 4 (desvio 3); o registro `nomes` do harness fecha a conta: no painel de detalhe há **exatamente 2 botões sem nome além dos 3 menus**.
- **Arquivo provável / TODOS os caminhos do mesmo defeito** (`git grep`):
  - `src/components/contacts/ContactCard.tsx:70` (`<Button variant="ghost" size="icon" className="w-8 h-8">` + `<MoreVertical/>`)
  - `src/components/contacts/ContactListItem.tsx:154` (mesmo padrão, `w-9 h-9`)
  - `src/components/contacts/ContactsTable.tsx:224` (mesmo padrão, `w-7 h-7`)
  - `src/components/contacts/ContactDetailPanel.tsx:222-228` (fechar: `<X className="w-4 h-4"/>` sem `aria-label`)
  - `src/components/contacts/ContactNotes.tsx:154-160` (adicionar nota: `<Plus className="w-3 h-3"/>` sem `aria-label`; o componente é montado dentro do painel — `ContactDetailPanel.tsx:420`)
- **Correção sugerida:** `aria-label={`Ações de ${contact.name}`}` no `Button` dos três cartões, `aria-label="Fechar detalhes"` no painel e `aria-label="Adicionar nota"` nas notas (ou `title` equivalente + `sr-only`). **Esforço: P**
- **Depende do mock:** a **contagem**, sim (3 nós = 3 contatos sintéticos; o número de nós escala com o dado, o defeito não).

### A11Y-CONTATOS_CRM-02 — Abas da conversa (inclui **SalesView**) sem nome acessível abaixo de 1536 px · **P1**
- **WCAG:** 4.1.2 / 2.4.6 · **axe:** `button-name` [critical] em `role="tab"`
- **Telas:** SalesView e CRM 360° (aba da conversa) · **8 nós** por combo, nos 4 combos de cada tela (**64 dos 141 nós** de `button-name`, §7): Chat, Arquivos, IA, CRM 360°, **SalesView**, Journey, Tarefas, Notas
- **Passos:** abrir um contato pelo botão "Conversar" do cartão (ou qualquer conversa) → barra `[data-testid="conversation-tabs"]`; em < 1536 px o rótulo está em `<span class="hidden 2xl:inline">` e o botão não tem `aria-label`, então a única coisa que sobra é o ícone.
- **Evidência (axe):** `button[data-testid="conversation-tab-orders"]` → `<button role="tab" aria-selected="false" data-testid="conversation-tab-orders" class="relative isolate h-9...">`; idem `conversation-tab-crm`, `-chat`, `-files`, `-ia`, `-history`, `-tasks`, `-notes`.
- **Arquivo provável:** `src/components/inbox/chat/ConversationTabs.tsx:62-88` (botão `role="tab"` sem `aria-label`, linha 62; rótulo escondido por breakpoint, linha 86)
- **Correção sugerida:** `aria-label={tab.label}` no botão da aba (mantendo o texto visível só a partir de `2xl`). É o portão de entrada do grupo SalesView: hoje um leitor de tela anuncia 8 abas sem nome. **Esforço: P**
- **Depende do mock:** não (a barra de abas é fixa, com as 8 mesmas abas em qualquer conversa).

### A11Y-CONTATOS_CRM-03 — `Select`s sem nome acessível nos filtros de Contatos e na paginação do CRM 360° · **P1**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `button-name` [critical] em `role="combobox"`
- **Telas/nós:** Contatos — filtros avançados (**4 nós** por combo, nos 3 combos medidos: Empresa, Cargo, Etiqueta, Período) · Contatos — mapa (**4 nós**, só 390 escuro: o painel ficou aberto, desvio 2) · Contatos — painel de detalhe (**4 nós**, só 390 escuro, mesma causa) · CRM 360° (**1 nó** por combo, nos 4 combos: itens por página). **24 dos 141 nós** de `button-name` (§7).
- **Passos:** `?view=contacts` → botão `Filtros` (`aria-controls="contact-filters-panel"`); `?view=crm360` → tabela ativa.
- **Evidência (axe):**
  - filtros: `.space-y-2:nth-child(1..4) > .rounded-md.border-input...` → `<button type="button" role="combobox" aria-expanded="false" aria-autocomplete="none" ...>` sem nome;
  - CRM 360°: `.\[\&>span\]\:line-clamp-1` → `<button type="button" role="combobox" ... data-state="closed">` (paginador 10/25/50/100).
- **Arquivo provável / todos os caminhos:**
  - `src/components/contacts/ContactAdvancedFilters.tsx:90, 106, 122, 138, 157` (`<SelectTrigger>` sem `aria-label`; só `placeholder` no `SelectValue`, que não nomeia o gatilho)
  - `src/components/crm360/DataExplorerTable.tsx:83-91` (`<SelectTrigger className="w-[80px] h-9">`)
  - contraste com o que já está certo: `ContactToolbar.tsx:95` usa `aria-label="Ordenar por"` — o mesmo padrão resolve aqui.
- **Correção sugerida:** `aria-label` em cada `SelectTrigger` ("Filtrar por empresa", "Filtrar por cargo", "Filtrar por etiqueta", "Período", …; "Itens por página" no CRM 360°). **Esforço: P**
- **Depende do mock:** em parte (quantos `SelectTrigger` o painel renderiza depende das listas que o mock devolveu — os 4 medidos; a ausência de nome não depende do dado).

### A11Y-CONTATOS_CRM-04 — Botões só de ícone do CRM 360° sem nome acessível (atualizar, paginação) · **P1**
- **WCAG:** 4.1.2 · **axe:** `button-name` [critical] — **3 nós** por combo no CRM 360° (atualizar, página anterior, próxima), nos 4 combos (**12 dos 141 nós**, §7). O 4º nó de `button-name` dessa tela é o `Select` de itens por página, que é o **CRM-03**.
- **Passos:** `?view=crm360` → cabeçalho da tabela (busca/atualizar) e rodapé (página anterior/próxima).
- **Evidência (axe):** `.hover\:border-secondary\/50.hover\:shadow-glow-secondary-sm...:nth-child(4)` → `<button class="inline-flex items-ce...">` (botão de atualizar) e `.px-2.h-7...:nth-child(1)` → `<button class="inline-flex items-ce..." disabled="">` (página anterior; o próximo é `nth-child(2)`). Com texto de busca preenchido, o `X` de limpar entra no mesmo conjunto.
- **Arquivo provável / todos os caminhos:** `src/components/crm360/DataExplorerTable.tsx:75-77` (limpar busca), `:92-94` (atualizar), `:157` e `:158` (anterior/próxima). Os cabeçalhos de coluna clicáveis (`:113-121`) são o mesmo tipo de controle sem alternativa de teclado (ver A11Y-CONTATOS_CRM-10).
- **Correção sugerida:** `aria-label="Atualizar"`, `"Página anterior"`, `"Próxima página"`, `"Limpar busca"`. **Esforço: P**
- **Depende do mock:** não (a barra da tabela e a paginação existem sempre; só a contagem de páginas vem do dado).

### A11Y-CONTATOS_CRM-05 — Contraste abaixo de 4,5:1 no tema claro em Contatos/CRM 360°/SalesView **e também no escuro dentro do CRM 360° da conversa** · **P2**
- **WCAG:** 1.4.3 · **axe:** `color-contrast` [serious] — **34 nós em 10 grupos** (tela × combo), sendo **8 grupos e 23 nós no tema claro** e **2 grupos e 11 nós no tema escuro**.
- **Telas/combos com ocorrência:** Contatos — mapa (390 e 1280, claro: 3 + 3 nós) · CRM 360° (view) (390 e 1280, claro: 2 + 2) · CRM 360° da conversa (390 claro 1, **390 escuro 4**, 1280 claro 6, **1280 escuro 7**) · SalesView (1280 claro 5) · Contatos — filtros (1280 claro 1).
- **Tema:** as duas únicas ocorrências no **escuro** estão na **aba CRM 360° da conversa** (painel do Inbox, herdado) e não em Contatos, CRM 360° (view) nem SalesView — é o que a §4.5 afirma.
- **Evidência (axe, com a razão medida):**
  - `.text-muted-foreground\/70.text-3xs` → `<p class="text-3xs text-muted-foreground/70">Posição aproximada pela região do DDD, não pelo endereço do cliente.</p>` — **3,02:1** (`#8a8f99` sobre `#f6f7f9`, 10 px) no mapa, claro;
  - `.px-1\.5` / `.px-2\.5` / `.ml-auto > .border-transparent.bg-secondary` → badges do CRM 360° (view) com **3,3:1** (`#e2ebf3` sobre `#3c7fdd`, 9–10 px), claro;
  - `.hover\:bg-primary\/25` → `<button class="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold ...">Criar negociação</button>` — **4,2:1** claro (`#2463eb` sobre `#dee8fc`) e **3,01:1** no escuro (`#2463eb` sobre `#1a233a`);
  - `section:nth-child(1..3) > header ... > .hover\:underline.text-primary` → "Editar" / "Ver funil →" / "Ver no SalesView →" — **3,42:1** no escuro (`#2463eb` sobre `#18181b`);
  - `[data-testid="conversation-item"] ... > .text-3xs.bg-destructive\/10[aria-label="SLA violado"] > span` → `<span>SLA</span>` — **2,53:1** claro (`#f37373` sobre `#fef1f1`) e **3,38:1** no escuro (`#ad3e49` sobre `#110607`);
  - badge `bg-secondary text-secondary-foreground` da linha de conversa — **1,09:1** claro (`#e2ebf3` sobre `#f4f4f7`);
  - `.text-\[8px\]` → `<div class="w-5 h-5 text-[8px] ... bg-info/15 text-info rounded-full" title="Brindes Promocionais LTDA">BP</div>` — **2,94:1** claro (`#308ce8` sobre `#e0eefc`);
  - `div[data-title=""]` → "Senha SIP não configurada. Adicione o segredo SIP_PASSWORD no Supabase." — **3,1:1** claro (`#ef4343` sobre `#f5e5e7`) na tela de filtros;
- **Arquivo provável:** `src/components/contacts/ContactMapView.tsx` (aviso de posição aproximada), `src/components/crm360/CRM360StatsCards.tsx`, `src/components/crm360/DataExplorerTable.tsx` (badge RFM/badge de contagem), `src/components/inbox/tabs/SalesViewTab.tsx` (cabeçalhos/links `text-primary`), `src/components/inbox/tabs/CommercialSummaryStrip.tsx` / `OpenDealsList.tsx` / `Crm360Tab.tsx` ("Criar negociação", "Ver funil →", selo `SLA`). Confirmar tom a tom na tela.
- **Correção sugerida — só tokens que EXISTEM (o cartão proíbe cor nova):**
  - `text-primary` sobre tinta (`bg-primary/15`) e os links `Editar` / `Ver funil →` / `Ver no SalesView →`: o par de TEXTO da primária já existe — `hsl(var(--primary-text))` (`src/styles/tokens.css:124` no claro, `:419` no escuro; **6,4:1 / 8:1**), com precedente no próprio projeto em `src/styles/utilities.css:245-246` (`.chip-active`). **`text-primary-strong` NÃO existe** em `tokens.css` nem em `tailwind.config.ts` — a versão anterior deste relatório sugeria esse nome por engano; não usar sem criar token (proibido neste cartão).
  - `text-muted-foreground/70` (aviso do mapa): usar `text-muted-foreground` cheio (5,7:1 claro / 9,3:1 escuro; precedente `utilities.css:234-236`, hoje aplicado só no módulo de Tarefas).
  - selo `SLA` e o aviso "Senha SIP não configurada" (`text-destructive` sobre tinta): existe par de texto — `hsl(var(--destructive-text))` (`tokens.css:169` claro, `:443` escuro; ≥4,5:1 sobre o card e sobre a própria tinta /15), precedente `utilities.css:226-228`.
  - badge `bg-secondary text-secondary-foreground` (3,3:1 claro; **1,09:1** na linha de conversa): **não há par que feche com esse preenchimento** (`--secondary: 215 70% 55%` + `--secondary-foreground: 210 40% 92%`). **Confirmar antes de usar:** decidir com o Claude se o ajuste é tinta mais escura mantendo o par, ou `bg-secondary/15` com texto do `foreground`.
  - avatar de empresa `bg-info/15 text-info` (2,94:1): **não existe `--info-text`** em `tokens.css` (só `--info-foreground`, que é para preenchimento cheio). **Confirmar antes de usar** — sem par de texto existente para `info`, a correção exige decisão do Claude; não inventar token.
  - **Esforço: M** (revisão token a token por tela, sem criar token nenhum).
- **Depende do mock:** sim para a **existência** de parte dos nós (o selo `SLA`, o avatar de empresa, os badges de contagem e as linhas de conversa só existem porque o mock devolveu dados; os pares de cor são do tema, não do dado).

### A11Y-CONTATOS_CRM-06 — `aria-controls` das abas de tipo de contato aponta para id inexistente · **P2**
- **WCAG:** 4.1.2 / 1.3.1 · **axe:** `aria-valid-attr-value` [critical] — **1 nó** em **15 combos** medidos de Contatos (lista, detalhe e mapa nos 4 combos; filtros nos 3 combos medidos)
- **Passos:** `?view=contacts` → abas de tipo (`Todos`, `Cliente`, …).
- **Evidência (axe):** `#radix-_r_6a_-trigger-all` → `<button type="button" role="tab" aria-selected="true" aria-controls="radix-_r_6a_-content-all" ...>` — "Invalid ARIA attribute value: aria-controls=`radix-_r_6a_-content-all`" (o elemento referenciado não existe no DOM: só o conteúdo da aba ativa é montado).
- **Arquivo provável (confirmado):** `src/components/contacts/ContactTypeTabs.tsx:3,44-78` — usa `Tabs`/`TabsList`/`TabsTrigger` do Radix e **não renderiza nenhum `TabsContent`**: as abas filtram a mesma lista, então o `aria-controls` gerado pelo Radix aponta para um id que nunca existe. `git grep -n "TabsTrigger" -- src/components/contacts` devolve só este arquivo (as demais abas do grupo vêm de `ContactViewSwitcher`/`ConversationTabs`, que não usam Radix `Tabs`).
- **Correção sugerida:** como não há painel por aba, trocar o `Tabs` por um grupo de botões (ou manter o Radix e montar um `TabsContent` oculto com a lista) — assim o `aria-controls` não fica pendurado. **Esforço: P**
- **Depende do mock:** não (é a montagem das abas, não o dado).

### A11Y-CONTATOS_CRM-07 — Alvos de toque abaixo de 24×24 px (WCAG 2.5.8 AA) no grupo · **P2**
- **WCAG:** 2.5.8 (Tamanho do alvo — mínimo, AA) · medição própria (largura × altura do `getBoundingClientRect`)
- **Telas:** Contatos (lista, painel de detalhe, formulário, mapa e filtros) e CRM 360° (aba da conversa)
- **Critério da lista:** só entram alvos com **menos de 24 px em alguma dimensão**. Alvo que alcança 24 px na menor dimensão não é violação de 2.5.8 e por isso **não** aparece aqui (vai para o CRM-11, que trata da prática móvel de 44 px).
- **Evidência (excertos medidos, com o rótulo do alvo):**
  - `button.peer.h-4.w-4` → **16×16** (`Selecionar Ana Roberta Nogueira da Silva`, checkbox do cartão — `ContactCard.tsx`) — Contatos: lista, painel de detalhe e formulário
  - `button.peer.shrink-0.border` → **18×18** (checkbox "Selecionar todos" — `ContactResultsSummary.tsx:43`) — Contatos: lista, painel de detalhe, formulário, mapa e filtros
  - `button.text-xs.font-medium.text-primary` e `button.text-xs.font-semibold.text-primary` → **33×16** (`Editar`), **104×16** (`Ver no SalesView →`), **89×16** (`Ver na Journey →`), **75×16** (`Ver pipeline →`) e **73×16** (`Criar tarefa →`) — CRM 360° (aba da conversa); a largura acompanha o texto, a **altura de 16 px** é o defeito
- **Arquivo provável / caminhos:** `src/components/contacts/ContactCard.tsx:57-64` (checkbox 16×16), `src/components/contacts/ContactResultsSummary.tsx:38-56` (checkbox 18×18, linha 43) e `src/components/inbox/tabs/Crm360Tab.tsx:113, 193, 264, 283` + `:253-259` (links de 16 px, renderizados pelo botão de ação de `src/components/inbox/tabs/SectionCard.tsx:57-63`).
- **Alvos que saíram deste achado:** os alvos medidos que **passam de 24 px na menor dimensão** (o botão `Criar negociação`, o fechar do painel de detalhe, o menu do cartão, a paginação do CRM 360°, o trilho do `Switch` e os controles do Mapbox) foram para o **CRM-11**, onde as dimensões estão medidas. Por isso `ContactDetailPanel.tsx:222` e `DataExplorerTable.tsx:157-158` **não** entram na lista de arquivos deste achado: nas duas linhas o alvo passa de 24 px na menor dimensão (está no CRM-11).
- **Correção sugerida:** dar área mínima de 24×24 px ao alvo clicável (padding/`min-h`/`min-w` ou `::before` com área estendida) sem mudar o desenho; nos checkboxes de 16×16/18×18 e nos links de 16 px de altura, aumentar o hitbox. **Esforço: M**
- **Depende do mock:** em parte (as dimensões são do componente; os alvos só existem porque o mock devolveu contatos/propostas).

### A11Y-CONTATOS_CRM-08 — `role="button"` aninhando controle interativo (axe `nested-interactive`) · **P3**
- **WCAG:** 4.1.2 · **axe:** `nested-interactive` [serious] — **27 nós em 19 grupos**
- **Telas:** Contatos (lista/detalhe/mapa/filtros, **1 nó** por combo = 15 nós em 15 grupos) e SalesView/CRM 360° da conversa (1280 claro e escuro, **3 nós** por combo = 12 nós em 4 grupos)
- **Evidência:**
  - `.select-none` → `<div role="button" tabindex="0" class="h-9 flex items-center gap-2 text-sm font-medium cursor-pointer select-none ...">` ("Selecionar todos" com `<Checkbox aria-hidden="true" tabIndex={-1}>` dentro — `ContactResultsSummary.tsx:39-56`). O `aria-hidden` + `tabIndex=-1` já mitiga o foco, por isso P3.
  - `.conversation-row-selected > .gap-3 > [role="button"]` → `<div role="button" tabindex="0" class="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer ...">` (linha da conversa com controles internos — área do Inbox, compartilhada com o cartão Y13).
- **Correção sugerida:** no "Selecionar todos", trocar o `Checkbox` decorativo por `<span aria-hidden>` com o mesmo desenho; na linha de conversa, tirar o `role="button"` do container e deixar o clique no `onClick` com um botão real interno. **Esforço: P**
- **Depende do mock:** sim no caso da linha da conversa (o nó só existe se o mock devolver conversas); o "Selecionar todos" é fixo.

### A11Y-CONTATOS_CRM-09 — Hierarquia de títulos salta de h1 para h3 nos cartões do CRM 360° · **P3**
- **WCAG:** 1.3.1 / 2.4.6 · **axe:** `heading-order` [moderate] — **8 nós em 8 grupos** (CRM 360° view e a aba CRM 360° da conversa, 1 nó em cada um dos 4 combos de cada tela)
- **Evidência (axe):** `h3` → `<h3 class="font-semibold tracking-tight text-sm flex items-center gap-2">` (título do `CardHeader` do `DataExplorerTable`) e `section:nth-child(1) > header ... > h3` → `<h3 class="text-sm font-semibold truncate">Empresa</h3>` (seções do `Crm360Tab`).
- **Arquivo provável:** `src/components/crm360/CRM360ExplorerView.tsx:104` (`CardTitle` renderiza `h3` sem `h2` antes) e `src/components/inbox/tabs/Crm360Tab.tsx` (`SectionCard`).
- **Correção sugerida:** usar `CardTitle` como `h2` (prop `asChild`/`as="h2"`) ou inserir os níveis faltantes. **Esforço: P**
- **Depende do mock:** sim (as seções `Empresa`/… do `Crm360Tab` só renderizam quando o mock devolve dados; a ordem h1→h3 do `DataExplorerTable` independe do dado).
- **Nota:** este é o achado que cita `CRM360ExplorerView.tsx`. Ele é **P3** e por isso esse arquivo **não** entra na lista de arquivos dos P1 (§8).

### A11Y-CONTATOS_CRM-10 — Cabeçalhos de coluna ordenáveis sem alternativa de teclado · **P3**
- **WCAG:** 2.1.1 (Teclado) / 4.1.2 · **não coberto pelo axe** (inspeção de código + DOM)
- **Tela:** CRM 360° (todas as abas de tabela)
- **Evidência:** `src/components/crm360/DataExplorerTable.tsx:113-121` — o `<TableHead>` tem `onClick` e `cursor-pointer`, mas **não** é `button`, não tem `tabIndex`, `role` nem `onKeyDown`: a ordenação por coluna só existe para quem usa mouse. (O `arrow-up-down` só aparece depois de ordenar.) Não apareceu em nenhuma medição de axe porque não é um controle focável.
- **Correção sugerida:** envolver o rótulo em `<button>` (mantendo `aria-sort` no `th`) ou adicionar `tabIndex={0}` + `onKeyDown` + `role="button"`. **Esforço: P**
- **Depende do mock:** não (estrutura da tabela).

### A11Y-CONTATOS_CRM-11 — Alvos entre 24 e 43 px: prática móvel de 44 px não é atendida nas telas do grupo · **P3**
- **WCAG:** 2.5.5 (AAA) / guia móvel de 44 px · medição própria
- **Evidência (agrupada por seletor, com as telas em que aparece):**
  - `button[data-testid^="conversation-tab-"]` → **32×36** (abas da conversa, inclui **SalesView**; também `conversation-tab-orders/-history/...`) — 390 e 1280
  - `button.relative.isolate.h-9` (`Cards`/`Lista`/`Tabela`/`Mais visualizações`) → **50×36 / 48×36** — Contatos (todas)
  - `button.inline-flex...justify-center` das abas de tipo (`Todos 129×40`, `Cliente 137×40`, … `Prestador de Serviço 201×40`) → **altura 40** — Contatos (todas)
  - `button.inline-flex...` `Conversar`/`Editar` do cartão e do painel → **36×36**
  - `button.justify-center.rounded-sm.font-medium` (abas de tabela do CRM 360°: `Empresas 101×26`, `Contatos 97×26`, `Tel. Contatos 108×26`, …) → **altura 26**
  - `button` do SalesView `Novo` → **84×28**; `RFM` → **57×26**
  - `button[data-testid="contact-show-legacy"]` (Switch) → **44×24**; `button.flex.w-full.items-center` do painel de filtros (`Todas as empresas`/`Todos os cargos`/…) → **284×40**
  - Controles do mapa (`mapboxgl-ctrl-zoom-in/-out/-compass`) → **32×32**
  - `button.h-8.px-3.rounded-lg` → **118×32** (`Criar negociação`, `Crm360Tab.tsx:186`) — CRM 360° (aba da conversa); **recebido do CRM-07** por passar de 24 px na menor dimensão
  - botões só de ícone de **32×32** (fechar do painel de detalhe, `ContactDetailPanel.tsx:222`, e menu do cartão, `ContactCard.tsx:70`) — Contatos (lista/painel de detalhe/filtros); **recebido do CRM-07** pelo mesmo motivo
  - `button` de paginação do CRM 360° (`h-7`) → **28 px** de altura (`DataExplorerTable.tsx:157-158`) — CRM 360° (view); **recebido do CRM-07** pelo mesmo motivo
  - `button` do item de menu lateral (casco, `38×38`) e grupo expansível (`41×30`) — visíveis nestas telas; o mesmo defeito do cartão **Y18** (estrutura geral), citado aqui só para não duplicar cartão.
- **Correção sugerida:** elevar as alturas para 44 px nas barras de aba/view-switcher e nas ações de cartão (as alturas já variam entre 36 e 40 no mesmo componente). **Esforço: M**
- **Depende do mock:** não (as medidas são do componente).

## 4. Verificado SEM problema (e como foi verificado)

1. **Rolagem horizontal:** 0 estouros em **31 medições** (`document.documentElement.scrollWidth == clientWidth`: 390/390 e 1280/1280) e 0 elementos fora da largura da viewport com ancestral que não recorta. Vale para Contatos (lista, filtros, detalhe, formulário, mapa), CRM 360° e SalesView nos dois viewports e temas.
2. **Foco de teclado visível:** 18 `Tab` por medição × **31 medições** — **0 elementos focados sem anel** (outline ≥ 1 px ou `box-shadow` presente). Não há, no grupo, controle alcançável por teclado sem indicação visual.
3. **Diálogos cabem na viewport:** formulário de contato **390×812** em 390×844 (rolável) e **512×768** em 1280×800 (rolável); painel de detalhe **380×844 / 380×800** com `ScrollArea` interno (`ContactDetailPanel.tsx:341`). Nenhum diálogo do grupo estourou largura ou altura.
4. **Textos cortados (inspeção, não medição).** No `DataExplorerTable.tsx:142` o `truncate` vem acompanhado de `title` com o valor completo (`<span title={String(row[col.key] ?? '')}>`). No `ContactCard.tsx` os elementos com `truncate` (nome `:108`, apelido `:119`, empresa `:123`, telefone `:137`, e-mail `:148`, rodapé `:160`) **não** declaram `title`; o valor completo continua sendo o texto do elemento (o corte é só visual, `text-overflow: ellipsis`), então o leitor de tela lê o valor inteiro e a perda fica restrita à leitura visual por ponteiro. Registrado como observação, não como achado — nenhum texto do grupo desaparece do DOM.
5. **Contraste no tema ESCURO:** nenhuma violação `color-contrast` nas telas de Contatos (lista, filtros, detalhe, formulário, mapa), no CRM 360° (view) nem no SalesView, nos dois viewports. As **únicas** ocorrências no escuro estão na **aba CRM 360° da conversa** (390 escuro, **4 nós**; 1280 escuro, **7 nós**) — painel do Inbox compartilhado, contabilizadas no A11Y-CONTATOS_CRM-05. É o mesmo recorte que o título do CRM-05 usa.
6. **Rede real:** só uma requisição escapou dos mocks nos 4 combos — o estilo do Mapbox (`api.mapbox.com/styles/v1/...`), bloqueado de propósito pelo guarda. Nenhuma chamada ao Supabase real: a auditoria correu 100% em dados sintéticos (desvio 1).
7. **Sem erro de medição:** todas as 31 execuções de axe/rolagem/alvos/nomes/foco concluíram (0 exceções no harness). As duas falhas registradas são do *harness* (abrir/fechar o painel de filtros em 390×844, desvio 2), não das medições.

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

O achado aparece na tela em que ele **foi medido**. Duas consequências disso: (a) o `Select` (`CRM-03`) aparece também em mapa e painel de detalhe porque o painel de filtros ficou aberto no combo 390 escuro (desvio 2) — os nós dessas combinações são os mesmos `SelectTrigger` do quadro de filtros; (b) o menu dos cartões (`CRM-01`) aparece na tela de filtros porque os cartões continuam no DOM atrás do painel aberto (ver §7). O `CRM-07` (alvos abaixo de 24 px) segue a mesma regra: aparece em Contatos (checkboxes de 16×16 e 18×18 dos cartões e do "Selecionar todos") e no CRM 360° da conversa (links de 16 px de altura) — **não** em CRM 360° (view) nem em SalesView, telas em que a varredura não registrou alvo abaixo de 24 px (os alvos de lá são de 26 px para cima e estão no CRM-11).

| Tela | Achados |
|---|---|
| Contatos — lista | 01 (P1), 06 (P2), 07 (P2), 08 (P3), 11 (P3) |
| Contatos — filtros avançados | 01 (P1, os menus dos cartões que ficam atrás do painel), 03 (P1), 05 (P2), 06 (P2), 07 (P2, os checkboxes dos cartões e o "Selecionar todos", que ficam atrás do painel aberto), 08 (P3), 11 (P3) |
| Contatos — painel de detalhe | 01 (P1), 03 (P1, só no combo 390 escuro — painel de filtros aberto), 06 (P2), 07 (P2), 08 (P3), 11 (P3) |
| Contatos — formulário | 07 (P2), 11 (P3) |
| Contatos — mapa | 03 (P1, só no combo 390 escuro — painel de filtros aberto), 05 (P2), 06 (P2), 07 (P2), 08 (P3), 11 (P3) |
| CRM 360° (view) | 03 (P1), 04 (P1), 05 (P2), 09 (P3), 10 (P3), 11 (P3) |
| SalesView (aba da conversa) | 02 (P1), 05 (P2), 08 (P3), 11 (P3) |
| CRM 360° (aba da conversa) | 02 (P1), 05 (P2), 07 (P2), 08 (P3), 09 (P3), 11 (P3) |

## 7. Contagem bruta do axe (por regra × tela × combo)

Números lidos de `.tmp/a11y-audit/dados.jsonl` (169 registros). **nós** = elementos distintos acusados; **grupos** = pares tela × combo com pelo menos uma ocorrência. O axe devolve no máximo **4 nós de amostra por regra** (desvio 3), então onde a amostra não fecha a conta a divisão usa o código (`arquivo:linha`) + o registro `nomes` do harness, e isso está dito em cada linha.

| Regra | impacto | nós | grupos | distribuição medida (nós por combo) |
|---|---|---|---|---|
| `button-name` | critical | **141** | 24 | Contatos lista **3** (×4 combos) · Contatos detalhe **5** (×3) e **9** (390 escuro) · Contatos filtros **7** (×3 combos medidos) · Contatos mapa **4** (só 390 escuro) · CRM 360° **4** (×4) · SalesView **8** (×4) · CRM 360° da conversa **8** (×4) |
| `nested-interactive` | serious | **27** | 19 | Contatos lista/detalhe/mapa/filtros **1** (15 grupos) · SalesView e CRM 360° da conversa **3** (1280, claro e escuro) |
| `aria-valid-attr-value` | critical | **15** | 15 | Contatos lista/detalhe/mapa **1** em cada combo (12) · Contatos filtros **1** nos 3 combos medidos |
| `color-contrast` | serious | **34** | 10 | Contatos mapa **3+3** (claro) · CRM 360° **2+2** (claro) · CRM 360° da conversa **1** (390 claro), **4** (390 escuro), **6** (1280 claro), **7** (1280 escuro) · SalesView **5** (1280 claro) · Contatos filtros **1** (1280 claro) |
| `heading-order` | moderate | **8** | 8 | CRM 360° e CRM 360° da conversa **1** em cada combo |

### Atribuição dos 141 nós de `button-name` (por achado)

| Achado | nós | de onde sai a conta |
|---|---|---|
| **CRM-01** (cartões + painel de detalhe) | **41** | 3 menus × 4 combos na lista (12) + 5 por combo no painel de detalhe (3 menus + fechar + nota) × 4 (20) + os 3 menus dos cartões que continuam no DOM atrás do painel de filtros aberto, nos 3 combos de filtros (9) |
| **CRM-02** (abas da conversa) | **64** | 8 abas × 4 combos em SalesView (32) + 8 × 4 na aba CRM 360° da conversa (32) |
| **CRM-03** (`SelectTrigger`) | **24** | 4 do painel de filtros × 3 combos de filtros (12) + 4 no mapa 390 escuro (4) + 4 no painel de detalhe 390 escuro (4) + 1 `Select` de itens por página × 4 combos do CRM 360° (4) |
| **CRM-04** (ícones do CRM 360°) | **12** | 3 botões só de ícone (atualizar, anterior, próxima) × 4 combos |
| **Total** | **141** | — |

Na tela de Contatos — filtros os **7 nós** são exatamente `3 menus` (CRM-01) **+ 4 `SelectTrigger`** (CRM-03), e no painel de detalhe em 390 escuro os **9** são `3 menus + 2 botões do painel` (CRM-01) **+ 4 `SelectTrigger`** (CRM-03). O registro `nomes` do harness (que lista os elementos sem nome acessível) confirma essa divisão: 3 botões de menu + 2 botões de painel na tela de detalhe, e 3 menus + os `input`/`switch`/`checkbox` sem nome na tela de filtros.

Achados **sem** ocorrência de axe, por serem de inspeção: `CRM-10` (cabeçalho de coluna ordenável — controle não focável, fora do alcance do axe). Os alvos de toque (`CRM-07`, `CRM-11`) vêm da medição própria de `getBoundingClientRect`, não do axe.

## 8. O que o cartão de correção deve considerar

- Os quatro P1 são todos **nome acessível** e se resolvem com `aria-label` em **8 arquivos**, exatamente os citados nos achados CRM-01 a CRM-04, sem duplicata:
  1. `src/components/contacts/ContactCard.tsx` (CRM-01)
  2. `src/components/contacts/ContactListItem.tsx` (CRM-01)
  3. `src/components/contacts/ContactsTable.tsx` (CRM-01)
  4. `src/components/contacts/ContactDetailPanel.tsx` (CRM-01)
  5. `src/components/contacts/ContactNotes.tsx` (CRM-01)
  6. `src/components/inbox/chat/ConversationTabs.tsx` (CRM-02)
  7. `src/components/contacts/ContactAdvancedFilters.tsx` (CRM-03)
  8. `src/components/crm360/DataExplorerTable.tsx` (CRM-03 e CRM-04)
  - `src/components/crm360/CRM360ExplorerView.tsx` **não** entra nesta lista: ele só é citado pelo achado **P3 CRM-09** (hierarquia de títulos). `ContactMapView.tsx`, `CommercialSummaryStrip.tsx`, `OpenDealsList.tsx` e `SalesViewTab.tsx` também ficam fora — todos eles aparecem **apenas no P2 de contraste (CRM-05)**, e `ContactMapView.tsx` **não** é citado pelo CRM-07 (o mapa entra no CRM-05 pelo aviso de posição aproximada). O **P2 de alvos (CRM-07, WCAG 2.5.8)** cita só `ContactCard.tsx`, `ContactResultsSummary.tsx` e `Crm360Tab.tsx` (com o botão de ação de `SectionCard.tsx`); os alvos de 24 px ou mais que estavam nesse achado passaram para o **P3 CRM-11**.
  - cabe **um** cartão de correção para os P1 (é o mesmo defeito em 8 arquivos).
- O P2 de contraste (`CRM-05`) exige decisão de token: `--primary-text` e `--destructive-text` já existem e resolvem a maior parte; `secondary` e `info` **não têm par de texto** e precisam de decisão do Claude antes de o cartão ser aberto (nada de token novo — ver a §3 CRM-05, item "confirmar antes de usar").
- `CRM-11` cita também botões do casco (38×38 / 41×30) que são do escopo do cartão **Y18** — não duplicar.
- `CRM-02` e `CRM-08` (linha da conversa) tocam o Inbox do cartão **Y13**; aqui ficam registrados por aparecerem nas telas deste grupo.
- Todo o relatório foi medido com **backend mockado e sessão falsa** (desvio 1): os pares de cor, a estrutura ARIA, o teclado e os alvos valem no app real, mas as **contagens de nós** e os nós que só aparecem com dado (selo `SLA`, badge RFM, seções do CRM 360° da conversa, imagem do mapa) precisam ser reconferidos quando o cartão de correção rodar com o banco LOCAL + admin local que o cartão Y14 pedia.
