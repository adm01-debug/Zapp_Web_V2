# Auditoria de acessibilidade e celular — Chat/Inbox e Teams

- **Data:** 2026-10-07
- **Cartão:** Y13 (`t_2ea84e89`) — plano `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Especialista:** worker (testes)
- **Escopo:** grupo Chat/Inbox (view `inbox`, rótulo "Chat") e Teams (`team-chat`): lista de conversas, painel do chat, detalhes do contato e as abas Arquivos / IA / CRM 360° / SalesView / Journey / Tarefas / Notas.
- **Natureza:** relatório. **Nenhum arquivo de produto foi alterado.**

## 1. Método (o que foi realmente executado)

Harness **local** do repositório: Playwright + `axe-core` (mesmo `require.resolve('axe-core/axe.min.js')` das specs `e2e/a11y-contraste.spec.ts` e `e2e/inbox-contraste.spec.ts`), com:

- **sessão FALSA** no localStorage (`e2e/fixtures/talkx-demo.ts` → `installFakeSession`), exatamente o padrão deslogado das specs de a11y do repo;
- backend **mockado** (`e2e/fixtures/mapa-mocks.ts` → `mockAppShell`, mais rotas de `contacts`/`messages`/`rpc` com 1 contato e 2 mensagens **sintéticos**);
- **rede real de produção BARRADA** (`bloquearRedeReal` → 403). Em **todas as 40 medições** a lista de requisições barradas voltou vazia (`redeBarrada=0`): nenhuma chamada a `*.supabase.co` ou à Mapbox escapou. Nenhum dado real, nenhuma credencial, nenhum banco.

Grades medidas: **390×844** e **1280×800**, tema **claro** e **escuro** (`localStorage.theme`) → 4 combinações por tela.
Por combinação: `axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] } })` + medições de rolagem horizontal, alvos de toque (< 44 px), texto cortado, nome acessível e ordem/estilo de foco.

**Total: 40 medições** (Inbox: inicial + chat + 7 abas, ×4 combinações; Teams: ×4). Comando: `npx playwright test --config=.tmp/pw-audit.config.ts` → `1 passed`. O instrumento é **temporário e não foi commitado** (o cartão só admite o arquivo deste relatório).

### 1.1 Limitações declaradas
- **Teclado virtual:** não é simulável em navegador headless. O critério "teclado virtual cobrindo campos" **não foi verificado** por medição; só foi possível conferir que não há rolagem horizontal e que os campos do compositor ficam dentro da viewport em 390×844.
- **Foco visível:** medido pela propriedade CSS `outline`. Os componentes do grupo usam foco por **anel (`box-shadow`, classes `focus-visible:ring-*`)**, que não aparece em `outline` — a medição por `outline` deu `none`/transparente em 169 amostras e portanto é **inconclusiva**; não foi aberto achado por isso. A declaração `focus-visible:ring-*` existe no código dos alvos auditados.
- **Modais deste grupo** (ex.: `NewConversationModal`, diálogos de arquivo): apenas os gatilhos foram medidos; o conteúdo dos diálogos não foi percorrido neste cartão — fica para a auditoria de "estrutura geral" (Y18) ou cartão próprio.
- As abas foram medidas **no estado em que abrem** com a fixture (algumas vazias, outras com dados). Achados de estado vazio valem para esse estado.

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
- **Tela:** Inbox → aba **Notas** (e presente também em medições da aba Chat, pelas seções já montadas)
- **Viewport/tema:** 390×844 e 1280×800, claro e escuro
- **Passos:** abrir a conversa → aba Notas (sem notas) → axe
- **Evidência (axe, 4 nós):**
  ```
  .bg-card:nth-child(1) > ul  ::  <ul class="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin"><p class="text-sm text-muted-foreground py-2">Nenhum registro ainda</p></ul>
  ```
- **Causa (arquivo provável):** `src/components/inbox/tabs/NotesTab.tsx:111-112` — o estado vazio coloca um `<p>` dentro do `<ul>`; leitores de tela deixam de anunciar a lista como lista (o `list-item` do `<li>` seguinte já está correto).
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
- **Causa (arquivo provável):** `src/components/team-chat/TeamConversationList.tsx:123` — o container tem `role="listbox"`, mas o estado vazio renderiza um `<div>` comum (`Nenhuma conversa`) em vez de `role="option"`/`role="presentation"`. No estado populado cada linha já é `role="option"` (linha 143), então o defeito é **só do estado vazio**.
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
- **Correção sugerida:** subir o token de texto (ex.: `text-muted-foreground` sem o `/70`) e o fundo do botão (`bg-primary/15` → `bg-primary/20` ou `text-primary` sobre `bg-background` com borda) — **sem criar cor nova**: usar os tokens já existentes (`muted-foreground`, `primary`, `destructive`).
- **Esforço:** M (quatro pontos; todos por token)

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
  |---|---|---|
  | `Favoritar conversa` | **16×16** | 21 |
  | `Resolver conversa` | **28×28** | 20 |
  | (botão sem rótulo, ícone de recarregar) `Atualizar` | **32×32** | 20 |
  | `Abrir menu` / `Buscar` / `Notificações` (cabeçalho móvel) | 40×40 | 20 cada |
  | `Expandir menu`, itens da barra lateral (38×38) | 38×38 | 20 cada |
- **Causa (arquivo provável):** barra de ações da linha em `src/components/inbox/VirtualizedRealtimeList.tsx` (`h-4 w-4`/`h-7 w-7` do grupo de ações). Os 40×40 e 38×38 são do **shell** (cabeçalho móvel e barra lateral), que pertencem ao grupo "estrutura geral" → **Y18**; ficam registrados aqui só como vizinhança medida.
- **Correção sugerida:** alvo mínimo de 44×44 (padding/alvo "fantasma" em volta do ícone) para favoritar/resolver/atualizar.
- **Esforço:** P

### A11Y-CHAT_INBOX_TEAMS-08 — P3 — Texto cortado por `truncate` em nomes e subtítulos
- **WCAG:** 1.4.4 (Resize text) / revisão manual
- **Tela:** Inbox — lista, cabeçalho do chat, cards das abas
- **Evidência (contagem de elementos com `overflow` oculto e `scrollWidth > clientWidth`):** 81 `<p>`, 78 `<span>`, 17 `<h3>` em 40 medições; nenhum deles com `title`/`aria-label` alternativo garantido.
- **Avaliação:** o `truncate` é intencional (nomes longos não devem quebrar a linha). **Não** foi classificado como defeito; entra como P3 para conferência de que o texto completo continua alcançável (tooltip/`title`) — a fixture não tem nome longo o bastante para provar o corte visual.
- **Esforço:** P (conferência)

### A11Y-CHAT_INBOX_TEAMS-09 — P3 — Conteúdo fora de landmark antes de a view montar
- **WCAG:** 1.3.1 · axe `region` (**moderate**)
- **Tela:** Inbox, na primeira medição (antes do conteúdo da view montar)
- **Evidência:** 1 nó `region` na medição imediatamente após o `goto`, ausente depois que a view monta.
- **Avaliação:** transitório do *loading*; registrar para não reabrir o mesmo achado no futuro.
- **Esforço:** P

## 3. Verificado **sem** problema

- **Rolagem horizontal:** `document.documentElement.scrollWidth == clientWidth` em **todas as 40 medições** (390 e 1280); nenhum elemento com `right` além da viewport foi encontrado nas telas do grupo. A barra de abas usa `overflow-x-auto` de propósito e não vaza.
- **Nome acessível:** `input`/`emoji`/botões de ícone do compositor **acompanhados** de `aria-label` responderam bem (axe `button-name` só apontou as abas do achado 01).
- **Nenhuma requisição à produção** a partir de qualquer tela do grupo (`redeBarrada=0` nas 40); nenhuma escrita saiu do sistema.
- **Tema escuro:** os mesmos achados de estrutura aparecem nos dois temas; nenhum defeito **exclusivo** do escuro foi encontrado além dos de contraste já listados em 04.
- **Teams:** além do achado 03, o header, o compositor e o estado vazio não geraram outras violações axe.

## 4. Tabela-resumo

### Por severidade
| Severidade | Qtd | IDs |
|---|---|---|
| **P0** | 0 | — |
| **P1** | 1 | 01 |
| **P2** | 6 | 02, 03, 04, 05, 06, 07 |
| **P3** | 2 | 08, 09 |

### Por tela
| Tela | Achados |
|---|---|
| Inbox — lista de conversas | 06, 07 |
| Inbox — painel do chat / abas da conversa | 01, 04, 08 |
| Inbox — abas Notas / IA | 02, 05 |
| Inbox — detalhes do contato | 04 (selo do avatar), 08 |
| Teams — lista de conversas | 03 |
| Comum às duas | 09 |
| Shell (cabeçalho móvel / barra lateral) — **fora do grupo, anotado p/ Y18** | 07 (40×40 e 38×38) |

## 5. Reprodutibilidade

Instrumento **temporário** usado nesta medição e **apagado antes do commit** (o cartão admite só o arquivo deste relatório):
- `e2e/zz-auditoria-a11y-temp.spec.ts` — percorre as telas, roda axe e coleta as medições;
- `.tmp/pw-audit.config.ts` — projeto isolado (`chromium`), sobe o dev server local e **não** reusa servidor de outra cópia;
- saída bruta preservada: `.tmp/audit/resultados.json` (40 medições) e `.tmp/audit-run2.log`.

Para reproduzir: montar de novo os dois arquivos acima (o spec é o mesmo padrão de `e2e/a11y-contraste.spec.ts`: deslogado, sessão falsa, rede real barrada) → `npx playwright test --config=.tmp/pw-audit.config.ts`. Como esse padrão **não usa banco nem segredo** e já roda no job de PR, os achados 01 e 03 podem virar gate permanente sem custo de infraestrutura.
