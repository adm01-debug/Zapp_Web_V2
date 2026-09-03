# Plano de correção de layout — 30 etapas

**Sintoma relatado:** a aplicação "é menor que a tela"; sobra uma faixa morta (~200–230px) à direita, com uma segunda barra de rolagem interna visível antes do fim da tela.

**Escopo:** shell de layout (`AppShell` → `main` → `ViewRouter/WithHeader` → views) e as 25 views que dependem dele.
**Não escopo:** cores/tokens de marca, conteúdo de negócio, banco.

---

## 1. Diagnóstico (causa raiz, lida no código)

### 1.1 Causa raiz — flex item sem `w-full`/`flex-1`

`src/components/layout/AppShell.tsx:121`

```
<main className="flex flex-1 overflow-hidden relative min-w-0 min-h-0 h-full max-h-full ...">
```

`main` é **flex container em row**. Seu filho de conteúdo vem de `WithHeader`:

`src/pages/ViewRouter.tsx:31-37`

```
function WithHeader({ viewId, children }) {
  if (FULL_SCREEN_VIEWS.has(viewId)) return <>{children}</>;
  return (
    <div className="flex flex-col h-full">            {/* ← flex item SEM w-full / flex-1 */}
      <div className="flex-1 min-h-0 overflow-auto p-6">{children}</div>
    </div>
  );
}
```

Esse `div` é um flex item com `flex: 0 1 auto` e `width: auto` → a largura usada é a **largura de conteúdo (max-content)**, limitada pelo container, e alinhada em `flex-start`. Resultado: a view ocupa apenas o que o conteúdo pede (~1400px nas grids de cards) e **o resto vira faixa morta à direita**.

Prova cruzada dentro do próprio código: as views em `FULL_SCREEN_VIEWS` (`ViewRouter.tsx:24` — `inbox`, `pipeline`, `omni-inbox`, `team-chat`, `email-chat`) **não passam** por esse wrapper; nelas o flex item é o `motion.div` de `ViewRouter.tsx:145` que tem `h-full w-full` → `width:100%` resolve contra `main` e preenche a tela. É exatamente por isso que o Inbox preenche e Contatos/Dashboard/Filas não.

### 1.2 Agravante — views sem `w-full` na raiz

Com o pai em sizing por conteúdo, `w-full` dos descendentes é tratado como `auto` durante o cálculo intrínseco. Auditoria (`grep` na raiz com `h-full`): **25 views sem `w-full`**, entre elas `ContactsView.tsx:70`, `QueuesView`, `AgentsView`, `ConnectionsView`, `GroupsView`, `TagsView`, `AdminView`, `SecurityView`, `CRM360ExplorerView`, `KnowledgeBaseView`, `AdvancedReportsView`, `ClientWalletView`. `DashboardView.tsx:58,80` tem `w-full` — e ainda assim herda o teto do pai.

### 1.3 Scroll duplo + padding duplo

`WithHeader` já cria um scroller com `overflow-auto p-6`. As views criam **outro**: `ContactsView.tsx:70` → `p-6 space-y-5 overflow-y-auto h-full`. Consequências: duas barras de rolagem aninhadas (a barra "no meio da tela" do print), 48px de padding somado, `ScrollToTopButton` preso ao scroller interno, sticky header inútil e restauração de scroll imprevisível.

### 1.4 Landmine — `src/App.css` órfão

`src/App.css:1-6` é o scaffold do Vite: `#root { max-width: 1280px; margin: 0 auto; padding: 2rem; text-align: center; }`. Hoje **não é importado por ninguém** (`grep "App.css" src/` = 0 resultados), mas qualquer import futuro trava a app em 1280px centralizada. Remover.

### 1.5 Alturas concorrentes

`src/index.css:31-45` define `html, body, #root { min-height: 100vh }` + `#root { display:flex; flex-direction:column }`, enquanto `AppShell.tsx:81` usa `h-screen max-h-screen min-h-screen` e `Sidebar.tsx:67` usa `h-screen` (dentro de um pai já `h-screen`). Em mobile, `100vh` conta a barra de URL → corte de conteúdo. Deve ser `100dvh` no shell e `h-full` na sidebar.

---

## 2. As 30 etapas

Cada etapa: **o que**, **onde**, **aceite**.

### Fase A — Correção estrutural (o bug do print)

**1. Remover `src/App.css`**
Arquivo órfão com `#root { max-width:1280px }`. Aceite: `grep -r "App.css" src/` vazio, `npm run build` verde.

**2. Corrigir o flex item de `WithHeader`**
`src/pages/ViewRouter.tsx:34` → `className="flex flex-col h-full w-full min-w-0 flex-1"`.
Aceite: em `/contatos` (viewport 1920), `document.querySelector('#main-content > div').clientWidth === main.clientWidth`.

**3. Blindar o `main` contra sizing por conteúdo**
`AppShell.tsx:121`: manter `flex flex-1 min-w-0`, adicionar `items-stretch` e garantir que todo filho direto de conteúdo seja `flex-1`. Aceite: nenhuma faixa morta com sidebar aberta ou recolhida (62px/220px).

**4. Dar `w-full min-w-0` ao `motion.div` do router**
`ViewRouter.tsx:139,145` — já tem `h-full w-full`; adicionar `min-w-0` para evitar que grids largas estourem em vez de encolher. Aceite: sem scroll horizontal em `/contatos` a 1280px.

**5. Corrigir o `ViewLoadingFallback`**
`src/components/layout/ViewLoadingFallback.tsx:6` → adicionar `w-full`. Aceite: skeleton do módulo ocupa a largura toda (hoje encolhe igual à view).

**6. Auditar e padronizar as 25 views sem `w-full`**
Aplicar `w-full` (ou `flex-1 min-w-0`) na raiz de cada uma das 25 listadas em 1.2. Aceite: script de auditoria (etapa 27) com 0 violações.

**7. Eliminar o scroll duplo — decidir o dono do scroll**
Regra: **o scroller é o wrapper do router**; view nunca cria `overflow-y-auto h-full` na raiz. Aceite: em qualquer view, `document.querySelectorAll('#main-content [class*=overflow-y-auto]')` com no máximo 1 elemento na cadeia raiz.

**8. Remover `overflow-y-auto h-full` das raízes das views**
Começar pelas 10 confirmadas: `Contacts, Dashboard, Admin, Agents, Connections, Groups, Queues, Tags, TranscriptionsHistory, ClientWallet`. Aceite: uma única barra de rolagem, colada na borda direita do `main`.

**9. Remover o padding duplo**
`WithHeader` mantém o padding (`p-6`); tirar o `p-6` das raízes das views. Aceite: distância borda-conteúdo = 24px (hoje 48px).

**10. Reapontar `ScrollToTopButton`/`scrollContainerRef`**
`ContactsView.tsx:70` prende o ref no div que deixará de rolar. Expor o scroller via contexto (`LayoutScrollContext`) em `WithHeader` e consumir nas views. Aceite: botão aparece após 400px de scroll real e volta ao topo.

### Fase B — Sistema de layout (não repetir o bug)

**11. Criar `src/components/layout/ViewContainer.tsx`**
Componente único: `flex flex-col h-full w-full min-w-0` + scroller + padding por densidade + slot de header sticky. Substitui o `WithHeader` inline.

**12. Substituir `WithHeader` por `ViewContainer`**
`ViewRouter.tsx:31-37`. Aceite: paridade visual em 6 views amostradas.

**13. Trocar a lista `FULL_SCREEN_VIEWS` por metadado do módulo**
Hoje é um `Set` de strings em `ViewRouter.tsx:24`, desacoplado do registro de navegação. Mover para `layout: 'full' | 'scroll'` em `sidebarNavConfig.ts`/`useCurrentModule`. Aceite: adicionar uma view nova não exige editar o router.

**14. Definir tokens de layout em `src/styles/tokens.css`**
`--layout-gutter`, `--layout-max-content`, `--layout-header-h`, `--sidebar-w`, `--sidebar-w-collapsed`. Aceite: nenhum `w-[220px]`/`p-6` hardcoded no shell.

**15. Ler a largura da sidebar do token**
`Sidebar.tsx:67` usa `w-[62px]`/`w-[220px]` literais. Trocar por token. Aceite: mudar o token move sidebar e conteúdo juntos.

**16. `h-screen` → `h-dvh` no shell**
`AppShell.tsx:81` e `index.css:31-45` (`100vh` → `100dvh`, mantendo `100vh` como fallback). Aceite: sem corte no rodapé em Safari/Chrome mobile.

**17. `Sidebar` com `h-full` em vez de `h-screen`**
`Sidebar.tsx:67`. Aceite: sidebar acompanha o shell, sem 2ª referência de viewport.

**18. Rail máximo de leitura, opcional e explícito**
Onde o conteúdo é textual (docs, settings, relatórios), `max-w-[var(--layout-max-content)] mx-auto`; nas views densas (contatos, tabelas), full-bleed. Aceite: decisão registrada por view, nunca herdada por acidente.

**19. Padronizar o header de página nas views**
`PageTemplate.tsx` existe e é bom, mas as views renderizam header à mão (ex.: `ContactsView.tsx:80-93`). Migrar as views de listagem para `PageTemplate` (título, ações, filtros). Aceite: alturas e paddings de header idênticos entre Contatos/Filas/Agentes.

**20. Header sticky de verdade**
Com o scroller único (etapa 7), o header do `PageTemplate` fica `sticky top-0 z-20` com `bg-card/95 backdrop-blur`. Aceite: título e ações permanecem visíveis ao rolar 2000px.

**21. Remover `contentVisibility: auto` do conteúdo do `PageTemplate`**
`PageTemplate.tsx:123` — com `containIntrinsicSize: auto 500px` isso causa pulo de scroll e altura errada em listas longas. Aceite: barra de rolagem sem salto ao rolar rápido.

**22. Grid responsivo dos KPIs**
`ContactsView.tsx:127-133` (`grid-cols-1 lg:grid-cols-4` + `col-span-3/1`) quebra em telas largas e deixa o card de aniversários órfão. Trocar por `grid-cols-[repeat(auto-fit,minmax(220px,1fr))]`. Aceite: cards preenchem de 1280px a 2560px sem buraco.

**23. Barra de filtros com `flex-wrap` + `min-w-0`**
Linha de filtros de Contatos (busca, ordenar, Filtros, Agrupar, Grid/Lista/Tabela/Pipeline/Mapa/Analytics/Colunas) hoje pressiona o layout. Aceite: a 1280px nada é cortado; a 1920px alinha à direita sem esticar.

### Fase C — Consistência visual e a11y

**24. Barra de rolagem consistente**
`src/styles/base.css:113-150` estiliza `::-webkit-scrollbar` em 7px, mas o scroller aninhado aparece com barra nativa. Com um scroller único, aplicar a classe utilitária e validar Firefox (`scrollbar-width`). Aceite: mesma barra em todas as views.

**25. `body { overflow-x: hidden }` só como rede de segurança**
`src/index.css:38-40` esconde bugs de overflow. Manter, mas adicionar guard em dev (`outline` em elementos mais largos que o viewport). Aceite: guard não acusa nada em 6 views.

**26. Foco visível no `main`**
`AppShell.tsx:121` usa `focus:outline-offset-[-2px]`; com o container corrigido o outline muda de lugar. Revalidar skip-link → `#main-content`. Aceite: Tab a partir da URL foca e mostra o contorno no conteúdo.

### Fase D — Validação e trava de regressão

**27. Script de auditoria de layout**
`scripts/ui-audit/layout-guard.mjs`: falha se alguma raiz de view tiver `h-full` sem `w-full`, ou `overflow-y-auto` na raiz, ou `p-6` duplicando o wrapper. Aceite: `node scripts/ui-audit/layout-guard.mjs` exit 0.

**28. Teste de regressão de largura**
Teste (Vitest + jsdom não mede layout → usar Playwright/Chromium já presente no ambiente) que abre 6 views a 1920×1080 e falha se `main.clientWidth - content.clientWidth > 1`. Aceite: teste vermelho no commit anterior à etapa 2, verde depois.

**29. Prova visual antes/depois**
Screenshots em 1280/1440/1920/2560 das 6 views principais, anexadas ao PR. Aceite: faixa morta ausente em todas.

**30. Fechamento**
`npm run lint` + `npm run build` + `npm run test` verdes; `CHANGELOG.md` atualizado; nota em `docs/design/` sobre a regra "toda view é `w-full min-w-0` e não cria scroller próprio"; deploy Vercel de preview conferido.

---

## 3. Ordem mínima para matar o sintoma hoje

Etapas **1, 2, 5, 8, 9** — cinco arquivos, ~10 linhas. O resto é o que impede o bug de voltar.

## 4. Riscos

| Risco | Mitigação |
|---|---|
| Remover `overflow-y-auto` das views quebra scroll interno de tabelas | Etapa 7 define o dono do scroll antes de mexer nas views (8) |
| `ScrollToTopButton` para de funcionar | Etapa 10 antes/junto da 8 |
| Views full-screen (inbox/pipeline) regridem | Não passam pelo wrapper; cobertas pelo teste da etapa 28 |
| Sessão paralela commitando no mesmo branch | Re-sync antes de cada fase (CLAUDE.md §3) |
