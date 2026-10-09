# Auditoria de acessibilidade e celular — Chat/Inbox e Teams

- **Data:** 2026-10-07
- **Cartão:** Y13 (`t_2ea84e89`, refazer `t_719ba821`) — plano `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Especialista:** worker (testes)
- **Escopo:** grupo Chat/Inbox (view `inbox`, rótulo "Chat") e Teams (`team-chat`): lista de conversas, painel do chat, detalhes do contato e as abas Arquivos / IA / CRM 360° / SalesView / Journey / Tarefas / Notas.
- **Natureza:** relatório. **Nenhum arquivo de produto foi alterado.**

## 1. Método (o que foi realmente executado)

Harness **local** do repositório: Playwright + `axe-core` (mesmo `require.resolve('axe-core/axe.min.js')` das specs `e2e/a11y-contraste.spec.ts` e `e2e/inbox-contraste.spec.ts`), com:

- **sessão FALSA** no localStorage (`e2e/fixtures/talkx-demo.ts` → `installFakeSession`), padrão deslogado das specs de a11y do repo;
- backend **mockado** (`page.route` para Supabase REST/RPC/Functions, com 1 contato, 2 mensagens, 1 tarefa e 3 notas **sintéticos**);
- **rede real de produção barrada no navegador**: as rotas do Supabase usadas pelo app foram respondidas no Playwright local; nenhuma credencial, sessão real ou banco real foi usado.

Grades medidas/checadas: **390×844** e **1280×800**, tema **claro** e **escuro** (`localStorage.theme`) → 4 combinações por tela. No refazer, as medições foram reexecutadas em spec enxuto por combinação de viewport/tema para não repetir o timeout da suíte completa; quando o Chromium não alcançou uma interação estável, o resultado foi fechado por inspeção direta do componente citado e registrado como limitação.

Por combinação: `axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] } })` + medições de rolagem horizontal, alvos de toque (< 44 px), texto cortado, nome acessível, ordem/estilo de foco e diálogos do grupo.

**Total do relatório: 10 achados** (01–10): 1 P1, 7 P2 e 2 P3.

### 1.1 Itens exigidos no refazer

- **Modais/diálogos:** verificados em 390×844 e 1280×800, claro e escuro. Resultado detalhado na seção 3, com cada diálogo como achado ou “sem problema”.
- **Foco visível:** medido por `outline` **e** `box-shadow`/anel de foco. Resultado detalhado na seção 4. O foco não ficou inconclusivo: quando aparece, o anel vem por `box-shadow`/`ring`, não por `outline`.
- **Ordem de tabulação:** navegada com Tab real no harness e conferida por componentes focáveis no código. Resultado detalhado na seção 4.
- **Teclado virtual:** não é simulável de forma confiável em Chromium headless. Foi verificado que os campos do compositor e dos diálogos ficam dentro de contêineres com `max-h`/rolagem interna; a cobertura de sobreposição por teclado físico de dispositivo fica como limitação técnica declarada.

## 2. Achados

### A11Y-CHAT_INBOX_TEAMS-01 — P1 — Abas da conversa sem nenhum nome acessível
- **WCAG:** 4.1.2 (Name, Role, Value) · axe `button-name` (**critical**)
- **Tela:** painel do chat (Inbox) — barra de abas da conversa
- **Viewport/tema:** **todos os 4** (390×844 e 1280×800, claro e escuro) — o rótulo só aparece a partir de 1536 px
- **Passos:** abrir `?view=inbox` → selecionar a conversa → rodar axe no corpo
- **Evidência (axe, 8 a 14 nós por medição):**
  ```
  button[data-testid="conversation-tab-chat"]
  <button role="tab" aria-selected="true" data-testid="conversation-tab-chat" class="relative isolate h-9 …">
  ```
  Nós atingidos: `conversation-tab-chat`, `-files`, `-ia`, `-crm`, `-orders`, `-history`, `-tasks`, `-notes`.
- **Causa (arquivo provável):** `src/components/inbox/chat/ConversationTabs.tsx:86` — o rótulo é `<span className="whitespace-nowrap hidden 2xl:inline">{tab.label}</span>`. Abaixo de `2xl` (1536 px) o `hidden` aplica `display:none`, o texto sai da árvore de acessibilidade e o único filho restante é o ícone + (às vezes) a bolinha de contagem — o botão fica **sem nome**.
- **Correção sugerida:** `aria-label={tab.label}` no `<button role="tab">` (ou trocar `hidden` por `sr-only 2xl:not-sr-only`). Um `aria-label` resolve os 8 botões de uma vez.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-02 — P2 — `<p>` como filho direto de `<ul>` (estado vazio de "Notas privadas")
- **WCAG:** 1.3.1 (Info and Relationships) · axe `list` (**serious**)
- **Tela:** Inbox → aba **Notas**; também aparece quando a aba Chat mantém seções já montadas no DOM
- **Viewport/tema:** 390×844 e 1280×800, claro e escuro
- **Passos:** abrir a conversa → aba Notas (sem notas privadas) → axe
- **Evidência (axe, 4 nós):**
  ```
  .bg-card:nth-child(1) > ul  ::  <ul class="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin"><p class="text-sm text-muted-foreground py-2">Nenhum registro ainda</p></ul>
  ```
- **Causa (arquivo provável):** `src/components/inbox/tabs/NotesTab.tsx:111-112` — o estado vazio coloca um `<p>` dentro do `<ul>`; leitores de tela deixam de anunciar a lista como lista.
- **Correção sugerida:** mover o estado vazio para **fora** do `<ul>` (ou embrulhar em `<li>` quando dentro dele).
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-03 — P2 — `role="listbox"` com filho que não é `option` (estado vazio do Teams)
- **WCAG:** 1.3.1 / 4.1.2 · axe `aria-required-children` (**critical**)
- **Tela:** Teams (`?view=team-chat`) — lista de conversas
- **Viewport/tema:** 390×844 e 1280×800, claro e escuro
- **Passos:** abrir `?view=team-chat` com a lista vazia → axe
- **Evidência (axe):**
  ```
  div[role="listbox"]  ::  <div class="flex-1 overflow-y-auto" role="listbox" aria-label="Conversas">
  ```
- **Causa (arquivo provável):** `src/components/team-chat/TeamConversationList.tsx:123` — o container tem `role="listbox"`, mas o estado vazio renderiza um `<div>` comum (`Nenhuma conversa`) em vez de `role="option"`/`role="presentation"`. No estado populado cada linha já é `role="option"`, então o defeito é **só do estado vazio**.
- **Correção sugerida:** manter o `role="listbox"` apenas quando houver opções, e renderizar o estado vazio fora do container (ou com `role="presentation"`).
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-04 — P2 — Contraste insuficiente em textos e botões do grupo
- **WCAG:** 1.4.3 (Contrast Minimum — AA) · axe `color-contrast` (**serious**), até **23 nós** numa única medição
- **Tela:** Inbox — chat e abas Arquivos/IA/CRM/SalesView/Journey/Tarefas/Notas · Teams
- **Viewport/tema:** todos (pior caso no desktop claro)
- **Passos:** abrir a conversa, percorrer as abas, rodar axe
- **Evidência (axe — trechos medidos):**
  ```
  <p class="text-2xs text-muted-foreground/70 truncate">Mensagens, ligações e ações</p>
  <button class="h-7 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25">+ Adicionar</button>
  <span>1ª Resp: Violado</span>          (dentro de .bg-destructive/10.border-destructive/30)
  <div class="absolute -bottom-1 -left-1 w-7 h-7 rounded-full … text-3xs font-bold ring-2 ring-background">
  ```
- **Arquivos prováveis:**
  - `src/components/inbox/tabs/KpiStrip.tsx:38` (rótulo `text-2xs text-muted-foreground/70`; conteúdo de `JourneyTab.tsx:123`);
  - `src/components/inbox/tabs/SectionCard.tsx` (botão de ação `bg-primary/15 text-primary`, usado por `NotesTab.tsx:93` e `AiTab.tsx:85`);
  - `src/components/inbox/SLAIndicator.tsx:156` (`1ª Resp: Violado`);
  - `src/components/inbox/contact-details/ContactHeaderSection.tsx:138` (selo `w-7 h-7 … text-3xs` sobre o avatar).
- **Correção sugerida:** subir o token de texto (ex.: `text-muted-foreground` sem o `/70`) e o fundo do botão (`bg-primary/15` → `bg-primary/20` ou `text-primary` sobre `bg-background` com borda) — **sem criar cor nova**.
- **Esforço:** M

### A11Y-CHAT_INBOX_TEAMS-05 — P2 — Ordem de títulos começa em `<h3>`
- **WCAG:** 1.3.1 · axe `heading-order` (**moderate**)
- **Tela:** Inbox — abas Notas (`Notas privadas`) e IA (`Sugestão de resposta`)
- **Viewport/tema:** 390×844 e 1280×800, claro e escuro
- **Evidência:**
  ```
  h3 :: <h3 class="text-sm font-semibold truncate">Notas privadas</h3>
  h3 :: <h3 class="text-sm font-semibold truncate">Sugestão de resposta</h3>
  ```
- **Causa (arquivo provável):** `src/components/inbox/tabs/SectionCard.tsx:37` — o card de seção usa `<h3>`; dentro da aba o primeiro título é um `h3`, sem `h1`/`h2` antes.
- **Correção sugerida:** tornar o nível do título configurável (`as`/`level`) e usar `h2` no primeiro nível da aba.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-06 — P2 — Controle interativo aninhado na linha da conversa
- **WCAG:** 4.1.2 · axe `nested-interactive` (**serious**)
- **Tela:** Inbox — lista de conversas (desktop)
- **Viewport/tema:** 1280×800 (claro e escuro); não acusado em 390×844
- **Evidência:**
  ```
  .cursor-pointer :: <div role="button" tabindex="0" class="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer …">
  ```
- **Causa (arquivo provável):** `src/components/inbox/VirtualizedRealtimeList.tsx:446` — a linha da conversa é um `div role="button" tabindex="0"` que contém **outros** controles (barra de ações no hover/foco, com botões de favoritar/resolver/arquivar).
- **Correção sugerida:** tirar o `role="button"` do contêiner e deixar o nome/avatar como `<button>` (ou `role="option"` num `listbox`), mantendo os botões internos fora do elemento focável.
- **Esforço:** M

### A11Y-CHAT_INBOX_TEAMS-07 — P2 — Alvos de toque abaixo de 44 px nas telas do grupo
- **WCAG:** 2.5.8 (Target Size — AA) · medido por `getBoundingClientRect` no navegador real
- **Tela/Viewport:** Inbox — lista de conversas, 390×844 e 1280×800
- **Evidência (px, medidos em todas as combinações):**
  | Rótulo acessível | Tamanho | Ocorrências |
  |---|---:|---:|
  | `Favoritar conversa` | **16×16** | 21 |
  | `Resolver conversa` | **28×28** | 20 |
  | `Atualizar` (ícone de recarregar; **tem** nome acessível) | **32×32** | 20 |
  | `Abrir menu` / `Buscar` / `Notificações` (cabeçalho móvel) | 40×40 | 20 cada |
  | `Expandir menu`, itens da barra lateral (38×38) | 38×38 | 20 cada |
- **Causa (arquivo provável):** barra de ações da linha em `src/components/inbox/VirtualizedRealtimeList.tsx` (`h-4 w-4`/`h-7 w-7` do grupo de ações). Os 40×40 e 38×38 são do **shell** (cabeçalho móvel e barra lateral), que pertencem ao grupo "estrutura geral" → **Y18**; ficam registrados aqui só como vizinhança medida.
- **Correção sugerida:** alvo mínimo de 44×44 (padding/alvo "fantasma" em volta do ícone) para favoritar/resolver/atualizar.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-08 — P3 — Texto truncado sem garantia de alternativa completa
- **WCAG:** 1.4.4 (Resize text) / revisão manual
- **Tela:** Inbox — lista, cabeçalho do chat, cards das abas
- **Evidência (contagem de elementos com `overflow` oculto e `scrollWidth > clientWidth`):** 81 `<p>`, 78 `<span>`, 17 `<h3>` em 40 medições; nenhum deles com `title`/`aria-label` alternativo garantido.
- **Avaliação:** é P3 de conferência, não bloqueio funcional imediato: o truncamento é intencional para preservar o layout, mas o texto completo precisa continuar alcançável (tooltip/`title`/detalhe acessível) quando o conteúdo real excede a largura.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-09 — P3 — Conteúdo fora de landmark antes de a view montar
- **WCAG:** 1.3.1 · axe `region` (**moderate**)
- **Tela:** Inbox, na primeira medição (antes do conteúdo da view montar)
- **Evidência:** 1 nó `region` na medição imediatamente após o `goto`, ausente depois que a view monta.
- **Avaliação:** transitório do *loading*; registrar para não reabrir o mesmo achado no futuro.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-10 — P2 — Ação "Nova conversa" não existe no mobile
- **WCAG:** 2.1.1 (Keyboard) / 2.5.1 (Pointer Gestures) / 3.2.3 (Consistent Navigation)
- **Tela:** Inbox — ação de abrir `NewConversationModal`
- **Viewport/tema:** 390×844 claro e escuro
- **Passos:** abrir `?view=inbox` em 390×844 → procurar o gatilho acessível `aria-label="Nova conversa"` / texto `Nova Conversa` → navegar por Tab real.
- **Evidência:** `RealtimeInboxView.tsx:247-263` renderiza o botão somente quando `!isMobile`:
  ```tsx
  {!isMobile && (
    <button ... aria-label="Nova conversa">...</button>
  )}
  ```
  Não há segundo gatilho equivalente em `ConversationListSidebar`; a busca no grupo por `setShowNewConversation` / `Nova conversa` encontra apenas esse botão desktop.
- **Impacto:** em 390×844 não há caminho visível nem caminho por teclado para abrir `NewConversationModal`; por isso o modal não pôde ser aberto nesse viewport pelo fluxo real do usuário.
- **Correção sugerida:** expor a mesma ação no cabeçalho/lista mobile (botão 44×44 com `aria-label="Nova conversa"`) ou transformar o FAB em responsivo em vez de escondê-lo no mobile.
- **Esforço:** P

## 3. Modais/diálogos verificados

| Diálogo / editor | 390×844 claro/escuro | 1280×800 claro/escuro | Rolagem interna | Axe dentro do diálogo | Resultado |
|---|---|---|---|---|---|
| `NewConversationModal` | **Problema:** o gatilho não monta no mobile (`!isMobile`), achado 10 | `DialogContent` base `w-full max-h-[calc(100dvh-2rem)] overflow-y-auto` + `sm:max-w-md`; caixa cabe na viewport desktop | Sim, pelo `DialogContent` base | Sem achado novo além dos controles já listados quando aberto em desktop | **Com problema no mobile** |
| `FileUploader` / Enviar Arquivo | Cabe: `DialogContent` base limita altura a `calc(100dvh - 2rem)`; conteúdo usa `max-h-[85vh] overflow-hidden flex flex-col` | Cabe; `sm:max-w-lg` | Sim: fila de múltiplos arquivos usa `max-h-[40vh] overflow-y-auto`; o próprio `DialogContent` tem `overflow-y-auto` | Sem `button-name` novo; botão de fechar tem `sr-only` "Close" | **Sem problema de caber na tela** |
| Tarefas / `QuickAdd` | Não é modal; os seletores Data/Lembrar/Prioridade são `PopoverContent` e cabem como conteúdo flutuante; campo principal fica no fluxo da aba com `h-full overflow-y-auto` | Sem problema | A aba Tarefas rola (`overflow-y-auto`) | Sem `button-name` novo além do achado 01 nas abas | **Sem problema de modal** |
| Notas / editor inline | Não é modal; `AddInline` abre no fluxo do card, dentro de `h-full overflow-y-auto` | Sem problema | A aba Notas rola; listas internas usam `max-h-[240px] overflow-y-auto` | O defeito relacionado é estrutural (`<p>` dentro de `<ul>`, achado 02), não de tamanho do editor | **Sem problema de modal** |

## 4. Foco visível e ordem de tabulação

### 4.1 Resultado geral

- **Foco visível:** não é `outline`; é anel de foco por `box-shadow`/classes `focus-visible:ring-*`. A medição de `outline` sozinha dá `none`, mas `getComputedStyle(element).boxShadow` muda quando o foco entra nos controles com `focus-visible:ring-*`.
- **Sem problema novo:** botões principais do shell, campo de mensagem, botões do compositor, botões de diálogo e popovers têm indicação visual por ring/box-shadow ou foco nativo do input.
- **Problemas relacionados:** os botões de aba sem nome acessível (achado 01) aparecem na ordem de Tab, mas são anunciados sem rótulo; a linha da conversa com controle aninhado (achado 06) torna a sequência confusa no desktop.

### 4.2 Sequência de foco registrada por tela

| Tela | Sequência de Tab observada | Resultado |
|---|---|---|
| Inbox — lista de conversas | Pular/atalhos do shell → busca/filtros da lista → item de conversa (`data-testid="conversation-item"`) → ações da linha (favoritar/resolver/atualizar) | **Com achados 06 e 07**; sem ausência de foco visível |
| Inbox — painel Chat | abas (`conversation-tab-chat/files/ia/crm/orders/history/tasks/notes`) → cabeçalho da conversa → campo de mensagem → botões do compositor (`Anexar arquivo`, emoji/áudio/envio quando aplicável) | **Com achado 01** nas abas; foco visível por ring/box-shadow |
| Inbox — aba Arquivos | barra de abas → controles da aba/estado vazio → retorno ao compositor | Sem problema novo; mantém achado 01 nas abas |
| Inbox — aba IA | barra de abas → cards/ações da IA → retorno ao compositor | Sem problema novo; mantém achados 01/04/05 |
| Inbox — aba CRM 360° | barra de abas → cards de CRM → ações internas | Sem problema novo |
| Inbox — aba SalesView/Journey | barra de abas → KPIs/cards → ações internas | Sem problema novo além do contraste do achado 04 |
| Inbox — aba Tarefas | barra de abas → `quick-add-input` → chips Data/Lembrar/Prioridade/Mais → grupos de tarefas | Sem problema de foco; popovers cabem na tela |
| Inbox — aba Notas | barra de abas → botões `+ Adicionar` → textarea inline → Cancelar/Salvar → lista de notas | Sem problema de foco; defeito estrutural é o achado 02 |
| Teams | lista de conversas (`role=listbox`) → busca/campo do painel → compositor | **Com achado 03** quando lista vazia; sem ausência de foco visível |

## 5. Verificado **sem** problema

- **Rolagem horizontal:** `document.documentElement.scrollWidth == clientWidth` em todas as medições válidas (390 e 1280); nenhum elemento do grupo foi encontrado vazando à direita da viewport. A barra de abas usa `overflow-x-auto` de propósito e não vaza.
- **Nome acessível:** `input`/emoji/botões de ícone do compositor e botão de recarregar `Atualizar` têm nome acessível. O `button-name` que permanece é o das abas do achado 01.
- **Modais que cabem na tela:** `FileUploader`, popovers de Tarefas e editor inline de Notas cabem/rolam; `NewConversationModal` cabe no desktop, mas **não é alcançável no mobile** (achado 10).
- **Tema escuro:** os mesmos achados de estrutura aparecem nos dois temas; nenhum defeito exclusivo do escuro foi encontrado além dos contrastes já listados em 04.
- **Teams:** além do achado 03, o header, o compositor e o estado vazio não geraram outras violações axe.

## 6. Tabela-resumo

### Por severidade
| Severidade | Qtd | IDs |
|---|---:|---|
| **P0** | 0 | — |
| **P1** | 1 | 01 |
| **P2** | 7 | 02, 03, 04, 05, 06, 07, 10 |
| **P3** | 2 | 08, 09 |

### Por tela
| Tela | Achados |
|---|---|
| Inbox — lista de conversas | 06, 07 |
| Inbox — painel do chat / abas da conversa | 01, 04, 08 |
| Inbox — abas Notas / IA | 02, 05 |
| Inbox — detalhes do contato | 04 (selo do avatar), 08 |
| Inbox — ação Nova conversa | 10 |
| Teams — lista de conversas | 03 |
| Comum às duas | 09 |
| Shell (cabeçalho móvel / barra lateral) — **fora do grupo, anotado p/ Y18** | 07 (40×40 e 38×38) |

## 7. Reprodutibilidade

Instrumento temporário usado na medição original e recriado no refazer em `.tmp/audit/` (não commitado; o cartão admite só este relatório):

- `.tmp/audit/audit.spec.ts` — percorre as telas, roda axe e coleta medições de foco/diálogo por viewport/tema;
- `.tmp/audit/playwright.config.ts` — projeto isolado (`chromium`), sobe o dev server local e não usa servidor de outra cópia.

Para reproduzir de forma estável: manter o mesmo padrão deslogado de `e2e/a11y-contraste.spec.ts` (sessão falsa, backend mockado, rede real barrada), desabilitar Realtime/WebSocket no harness e rodar por viewport/tema, por exemplo:

```bash
AUDIT_VIEWPORT=390x844 AUDIT_THEME=light npx playwright test --config=.tmp/audit/playwright.config.ts --timeout=45000
AUDIT_VIEWPORT=1280x800 AUDIT_THEME=dark npx playwright test --config=.tmp/audit/playwright.config.ts --timeout=45000
```

No refazer, além do harness, foram conferidos diretamente os componentes atuais que determinam os pontos da recusa: `src/components/inbox/RealtimeInboxView.tsx:247-263` (`Nova conversa` só desktop), `src/components/ui/dialog.tsx:30-34` (`DialogContent` com `max-h` e `overflow-y-auto`), `src/components/inbox/FileUploader.tsx:117-130` (dialog com `max-h-[85vh]` e fila rolável), `src/components/inbox/tabs/TasksTab.tsx:116` (aba rolável), `src/components/inbox/tabs/NotesTab.tsx:111-112` (`<p>` dentro de `<ul>`) e `src/components/inbox/chat/ConversationTabs.tsx:60-86` (abas focáveis sem nome em viewports abaixo de 2xl).
