# PROMPT DE EXECUÇÃO — REDESIGN "NAVY PREMIUM" DO MÓDULO CONTATOS | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR)
> **Repo:** `adm01-debug/Zapp_Web_V2` (branch base `main` @ `e9d06a3` ou posterior)
> **Deploy:** Vercel `zapp_web_v2` (`prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`, team `juca1`) — preview automático por branch
> **Tela alvo:** `https://zapp-web-v2.vercel.app/?view=contacts`
> **Referência visual:** imagem "ChatGPT_Image_6_de_set_2026_18_40_56.png" (1672×941). **Toda a paleta e geometria dela já foram medidas e estão na seção 2 — a seção 2 é a fonte da verdade executável.** O PNG em si só é necessário para o composite opcional (E.4); se estiver em `docs/design/contatos-reference.png`, use; se não estiver, E.4 é pulado e os gates E.2/E.3 bastam.
> **Ledger de progresso (obrigatório):** `docs/design/REDESIGN_CONTATOS_STATUS.md`
> **Versão do plano:** 2.0 — 06/09/2026 — escrito após post-mortem dos PRs #248 e #249

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 Por que a tentativa anterior falhou (fatos verificados, não opinião)

Os PRs #248 e #249 (ambos hoje) foram mergeados e **deployados com sucesso** (`e9d06a3` READY em produção). Mesmo assim a tela "ficou igual". Causa raiz, confirmada no diff:

| O que foi feito | Por que não mudou nada |
|---|---|
| padding, gap, avatar 56px, remover animações, dropdown "Mais" | Todo componente lê `bg-card`, `bg-background`, `border-border`, `bg-muted` de `src/styles/tokens.css`. **Nenhum token foi tocado.** A identidade do mockup é 70% superfície navy + tiles coloridos + controles azuis. |
| commit intitulado "pixel-perfect" | Ninguém renderizou a tela. Não existe screenshot, medida ou comparação em nenhum dos dois PRs. |
| `ContactCard.tsx` "reescrito" | O card já era estruturalmente igual ao mockup. Foi gasto token no lugar que menos importava. |

Existe ainda uma **armadilha que teria anulado até uma troca de tokens**: `index.html` aplica no boot um skin salvo em `localStorage['theme-custom-colors']` (`cssVarsCache`) como `style` inline no `:root`, e `src/components/settings/theme/presets.ts` (`buildPreset`) tem os neutros dark **hardcoded** (`240 8% 6%`, `240 7% 11%`…). Qualquer usuário com skin salvo continuaria vendo cinza-violeta. A Fase 1 resolve isso.

### 0.2 Regras invioláveis (anti-falha)

1. **Nenhum checkpoint fecha sem evidência.** Evidência = caminho de screenshot + saída dos scripts de medida + SHA do commit, escritos no ledger `docs/design/REDESIGN_CONTATOS_STATUS.md`. "Feito" sem arquivo é mentira; não escreva.
2. **Ordem é lei: tokens → shell → componentes.** Não abra `ContactCard.tsx` antes do CP1 aprovado. Se a paleta não bateu, nada do resto vai bater.
3. **Nunca afirme "pixel-perfect", "idêntico" ou "validado".** Escreva o número: `Δ cor página = 2.1 ΔE`, `altura KPI = 110px (alvo 108 ±6)`.
4. **Diff mínimo por arquivo.** Reescrever arquivo inteiro para trocar classes é proibido. Use edições cirúrgicas. Exceções explicitamente listadas: `ContactStatsCards.tsx`, `ContactViewSwitcher.tsx` (reescrita autorizada).
5. **Zero regressão funcional.** A lista da seção 4 é contrato. Cada handler/prop existente continua ligado ao mesmo elemento.
6. **Zero backend.** Nada de migration, RLS, RPC, Edge Function, schema. A única query nova é um `select` de colunas já existentes em `contacts`.
7. **Zero dado hardcoded.** Os nomes do mockup (Alexandre Oliveira, Bruno Santos…) são proibidos no código. Sparkline sem dado real = não renderiza.
8. **Componentes compartilhados só mudam via variante/prop nova com default = comportamento atual** (`PageHeader`, `Button`, `Badge`, `Tabs`). Nunca altere o default.
9. **Ratchets são gates, não sugestões.** Após cada fase: `npm run typecheck` (baseline é **zero** — qualquer erro TS falha), `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check`, `vitest run src/components/contacts`. Baseline só é atualizado seguindo `scripts/ci/README.md` e com a justificativa no commit.
10. **Armadilha do lint-ratchet:** ele casa violações legadas por `contextHash` das linhas vizinhas. Inserir código *antes* de uma violação antiga faz o ratchet acusar dívida nova. Se acontecer, mova sua inserção para *depois* do trecho legado; não toque no baseline por isso.
11. **Branch e PR, nunca push direto em `main`.** Branch: `redesign/contatos-navy-v2`. Um commit por fase, mensagem `redesign(contatos): fase N — <o que>`.
12. **Sem bibliotecas novas de UI.** Permitido: `@fontsource-variable/inter` (fonte) e, **fora do repo** em `/workspace/qa`, `playwright`, `pngjs`, `pixelmatch` (ferramentas de QA).
13. **Máximo 3 iterações por loop visual.** Na 3ª, registre o resíduo no ledger e siga. Não entre em loop infinito de ajuste de 1px.
14. **Shell dos containers é `dash`.** Sem `[[ ]]`, arrays, `source`. Sem `python3` no container — QA em Node.
15. **Se algo do plano contradisser o código real, o código real vence — e você registra a divergência no ledger antes de decidir.**

---

## 1. CONTEXTO VERIFICADO (leitura feita em 06/09/2026)

### 1.1 Stack e comandos reais (`package.json`)
- Vite 8 + React 19 + TS 5.8 + Tailwind 3.4 + shadcn/Radix + framer-motion 12 + TanStack Query 5 + lucide-react + date-fns.
- Scripts: `dev`, `build`, `lint`, `typecheck` (= `tsc -b --force`), `test` (= `vitest run`), `implicit-any-check`, `test:e2e` (playwright).
- Node ≥ 24. Husky ativo (`prepare`).

### 1.2 Arquivos do módulo (todos existem em `src/components/contacts/`)
`ContactsView.tsx` (orquestrador) · `ContactStatsCards.tsx` · `ContactToolbar.tsx` · `ContactViewSwitcher.tsx` · `ContactResultsSummary.tsx` · `ContactContentArea.tsx` · `ContactCard.tsx` · `ContactListItem.tsx` · `ContactsTable.tsx` · `ContactGroupedList.tsx` · `ContactDetailPanel.tsx` · `ContactDialogs.tsx` · `ContactSearchWithSuggestions.tsx` · `FilterPresets.tsx` · `ContactAdvancedFilters.tsx` · `BulkActionsBar.tsx` · `ContactsSkeleton.tsx` · `contactTypeConfig.tsx` (é `.tsx`, não `.ts`) · `types.ts` · `useContactsViewState.ts` · `useContactsCRUD.ts` · `__tests__/`.

Fora do módulo: `src/hooks/crm/useContactsSearch.ts` (paginação 50, `contacts_count_by_type`), `src/services/contact.service.ts` (`search_contacts` RPC, `.from('contacts').select` já usado — RLS permite select), `src/components/layout/{PageHeader,Sidebar,SidebarNavItem,SidebarNavGroup,AppShell,ViewContainer,sidebarNavConfig}.tsx`, `src/styles/{tokens,base,utilities,components,animations,sidebar,accessibility}.css`, `tailwind.config.ts`, `index.html`, `src/components/settings/theme/presets.ts`.

### 1.3 Estado atual dos tokens dark (`src/styles/tokens.css`, bloco `.dark`)
```
--background: 0 0% 4%      --card: 240 7% 11%      --border: 240 8% 20%
--input: 240 8% 16%        --muted: 240 8% 16%     --sidebar-background: 240 8% 9%
--primary: 221 83% 53%     --success: 155 80% 50%  --font-sans: 'Outfit'  --font-display: 'Plus Jakarta Sans'
--sidebar-w: 220px         --layout-gutter: 1.5rem
```

### 1.4 Bugs de dado encontrados (corrigir de graça no caminho)
- `ContactStatsCards` calcula "Novos (30 dias)", sparklines e % **só sobre a página atual (50 contatos)**, não sobre a base. O número é falso.
- `uniqueCompanies` (KPI "Empresas") vem só da página atual — também falso.
- Card exibe "Último contato em {created_at}" — é data de cadastro, não de contato.
- `PageHeader` renderiza ícone Home + `sr-only "Início"` **e** o breadcrumb `Início` passado por props → "Início" duplicado para leitor de tela.

---

## 2. SPEC VISUAL MEDIDA (extraída da referência com script, não a olho)

### 2.1 Paleta (mediana de regiões planas da imagem)

| Token | HSL | HEX aprox. | Onde |
|---|---|---|---|
| `--background` | `216 58% 8%` | `#08121f` | fundo da página |
| `--card` | `215 48% 10%` | `#0d1725` | cards de contato, Sincronizar |
| `--card-elevated` | `215 60% 12%` | `#0c1a30` | KPI cards (levemente mais claros, gradiente sutil) |
| `--popover` | `216 50% 11%` | `#0e1828` | dropdowns |
| `--border` | `217 40% 16%` | `#182640` | bordas 1px (mockup: `#131c2a`–`#1b2a45`) |
| `--input` | `216 56% 9%` | `#0a1423` | busca, sort, Filtros |
| `--muted` | `216 45% 14%` | `#141f34` | fundos secundários |
| `--muted-foreground` | `215 22% 66%` | `#93a1ba` | textos secundários |
| `--foreground` | `210 40% 98%` | `#f7f9fc` | texto principal |
| `--primary` | `217 100% 54%` | `#1470ff` | Cards ativo, badge 1.516, ícones ativos |
| `--primary-glow` | `217 100% 68%` | `#5c9dff` | texto do CRM 360°, hover |
| `--accent` | `217 96% 21%` | `#022a6a` | sidebar item ativo, tab ativa |
| `--accent-foreground` | `217 100% 85%` | — | texto sobre accent |
| `--success` | `148 100% 42%` | `#00d464` | **Novo Contato**, delta ↑, dot Online |
| `--warning` | `48 96% 53%` | `#facc15` | ícone Leads |
| `--sidebar-background` | `216 51% 10%` | `#0c1625` | sidebar |
| `--sidebar-accent` | `217 96% 21%` | `#022a6a` | item ativo |
| `--sidebar-border` | `217 40% 16%` | — | divisórias |
| `--ring` | `217 100% 54%` | — | focus |
| Tile KPI azul | fundo `217 98% 24%` / ícone `217 100% 62%` | `#01307b` / `#3d8bff` | Total |
| Tile KPI verde | fundo `168 86% 14%` / ícone `148 100% 45%` | `#054236` / `#00e56a` | Novos |
| Tile KPI roxo | fundo `244 51% 26%` / ícone `258 90% 72%` | `#252165` / `#a78bfa` | Empresas |
| Tile KPI amarelo | fundo `48 40% 17%` / ícone `48 96% 53%` | `#3b3518` / `#facc15` | Leads |
| Badge "Cliente" | fundo `218 90% 18%`, borda `217 100% 54%/60%`, texto `217 100% 80%` | `#042255` | tipo no card |
| CRM 360° botão | fundo `220 91% 18%`, borda `217 100% 54%/50%`, texto `--primary-glow` | `#042159` | header |
| Glow da página | `radial-gradient(1100px 520px at 8% -8%, hsl(217 100% 54% / .14), transparent 60%)` | — | canto superior esquerdo (atrás da sidebar/header) |

Modo claro **não muda** nesta entrega (só o bloco `.dark`). Verificar que não quebrou.

### 2.2 Tipografia
- Família única: **Inter** (variable, 400/500/600/700/800). Substitui Outfit e Plus Jakarta Sans em `--font-sans` e `--font-display`. Headings com `letter-spacing: -0.02em`.
- Escala usada na tela (px, medida por cap-height na referência):

| Elemento | Tamanho / peso | Cor |
|---|---|---|
| Breadcrumb | 15 / 400 (último item 15 / 600 branco) | muted-fg |
| Título "Contatos" | **38 / 800**, tracking -0.02em | foreground |
| Subtítulo | 18 / 400 | muted-fg |
| Botões do header | 16 / 600 | — |
| KPI label | 15 / 500 | muted-fg |
| KPI valor | **34 / 700**, `font-variant-numeric: tabular-nums` | foreground |
| KPI delta | 14 / 600 | success / destructive / muted |
| KPI "vs. período anterior" | 14 / 400 | muted-fg/80 |
| Tab | 15 / 500 (ativa 600) | — |
| Toolbar (busca, sort, filtros) | 15 / 500 | — |
| Linha de resultados | 14 / 500 (números 600 branco) | muted-fg |
| Nome no card | 16 / 600 | foreground |
| Badge tipo | 12.5 / 500 | — |
| Empresa / telefone / email | 13.5 / 400 | muted-fg (email: `text-[hsl(215_30%_78%)]`) |
| Rodapé "Último contato" | 12.5 / 400 | muted-fg/80 |
| Sidebar item | 15 / 500 | — |
| Sidebar grupo | 12 / 600, tracking 0.06em | muted-fg |

### 2.3 Geometria (viewport 1672×941, sidebar expandida)

| Bloco | Medida alvo | Tolerância |
|---|---|---|
| Sidebar largura | **234px** | ±4 |
| Logo tile sidebar | 44×44, radius 12 | ±2 |
| Item sidebar | h 44, radius 10, ativo com borda 1px `primary/60` + glow | ±2 |
| Padding esquerdo do conteúdo | 36px | ±4 |
| Linha topo (breadcrumb + busca global/sino/avatar) | h 56; busca 220×36 | ±4 |
| Título → topo | breadcrumb y≈31, título y≈63–91 | — |
| Botões header | **h 48**, radius 12, gap 12 | ±2 |
| KPI card | **h 108**, radius 14, padding 16, gap 12, 4 colunas | ±6 |
| KPI tile ícone | **60×60**, radius 12 | ±2 |
| Barra de tabs | h 52, radius 14, padding 6; pill ativa h 40 radius 10 | ±4 |
| Toolbar controles | **h 44**, radius 12 | ±2 |
| Busca toolbar | flex-1 (≈433px em 1672) | — |
| Segmentado Cards/Lista/Tabela | h 44; Cards ≈100px, Lista ≈94, Tabela ≈105 | ±8 |
| Linha "Selecionar todos" | h 36; botões paginação **36×36** radius 10 | ±2 |
| Card de contato | **h 164** (min-h), radius 14, padding 16, gap 12, 4 colunas | ±10 |
| Avatar card | **64×64**, ring 2px `border/70` | ±2 |
| Badge tipo | h 24, radius full, padding 0 10 | ±2 |
| Botões do rodapé do card | **36×36**, radius 10, borda 1px | ±2 |
| Espaço entre linhas de cards | 12 | ±2 |

### 2.4 Layout (wireframe da área de conteúdo)
```
┌ 36px ─────────────────────────────────────────────────────────────────── 36px ┐
│ ⌂ Início › Gestão › Contatos                     [🔍 Buscar no sistema…] 🔔 (AO)│  h56
│                                                                                 │
│ Contatos  (38/800)                       [✦ CRM 360°] [↻ Sincronizar] [＋ Novo Contato]│  h48
│ Base de clientes e leads (1.516 contatos)                                       │
│                                                                                 │
│ ┌KPI──────────┐ ┌KPI──────────┐ ┌KPI──────────┐ ┌KPI──────────┐               │  h108
│ │[tile] label  │ │[tile] label  │ │[tile] label  │ │[tile] label  │               │
│ │  1.516 ↑85%  ~│ │  50   ↑12% ▮▮│ │  0   ────  ~ │ │ 1.516 ↑85% ~ │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
│ ┌Tabs──────────────────────────────────────────────────────────────────────────┐ │  h52
│ │[👥 Todos 1.516] 👤 Cliente 1.516  🚛 Fornecedor  ✓ Colaborador  ⭐ Lead  … 🎁 …│ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ [🔍 Buscar por nome, telefone, email ou empresa…] [⇅ Nome (A-Z) ▾] [⏚ Filtros] [🔖 Filtros Salvos]  [▦ Cards|≡ Lista|▤ Tabela] [⚙ Colunas] │ h44
│ ☐ Selecionar todos │ Exibindo 50 de 1516 contatos                 Página 1 de 38 [‹][›] │ h36
│ ┌Card──────────┐ ┌Card──────────┐ ┌Card──────────┐ ┌Card──────────┐               │  h164
│ │(64) Nome   ⋮ │ …                                                                │
│ │     [Cliente]│                                                                  │
│ │     Empresa  │                                                                  │
│ │ ☎ 55119…     │                                                                  │
│ │ ✉ email      │                                                                  │
│ │ ◷ Último… [💬][✎]│                                                              │
│ └──────────────┘                                                                  │
```
Alinhamento: tudo à esquerda; ações à direita; números tabulares.

### 2.5 Motion ("efeitos tipo React") — uma orquestração, não confete
- **Entrada da página (1 vez):** KPI valores com count-up 600ms (framer `animate` de 0→valor, `useReducedMotion` respeitado); sparkline com `pathLength` 0→1 em 700ms; cards com fade 150ms **sem stagger** (máx 12 itens, `delay: index * 0.02`, cap 0.24s).
- **Tabs:** pill ativa desliza com `layoutId="contacts-type-pill"` (spring stiffness 400, damping 32).
- **Segmentado Cards/Lista/Tabela:** mesma técnica, `layoutId="contacts-view-pill"`.
- **Card hover:** `y: -2`, borda → `primary/40`, sombra `0 8px 24px -8px hsl(217 100% 54% / .35)`; 150ms. Sem `scale`.
- **Botões:** `whileTap={{ scale: 0.98 }}` nos 3 do header e nos ícones do card.
- **Troca de view mode:** `AnimatePresence mode="wait"` fade 120ms.
- **Skeleton:** shimmer já existe em `tailwind.config.ts` (`animate-shimmer`); usar.
- **Proibido:** partículas, aurora, glow pulsante infinito, stagger > 12 itens, animação em scroll.
- Tudo dentro de `prefers-reduced-motion` → duração 0.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Arquivos que serão alterados (diff cirúrgico)
| Arquivo | Mudança |
|---|---|
| `index.html` | link Google Fonts → Inter; fallback de fonte no boot; guarda `v: 2` no skin |
| `src/index.css` | `--font-sans: 'Inter Variable', 'Inter'` |
| `src/styles/tokens.css` | bloco `.dark` → paleta navy; `--font-*`; `--sidebar-w: 234px`; `--layout-gutter: 2.25rem`; novos `--kpi-tile-*`; `--page-glow` |
| `src/styles/base.css` / `components.css` / `sidebar.css` | só se houver cor hardcoded (grep) — troca por token |
| `src/components/settings/theme/presets.ts` | `buildPreset.dark` neutros → navy; `STORAGE_VERSION = 2` |
| hook/provider que lê `STORAGE_KEY` (descobrir por grep) | descarta skin sem `v === 2` |
| `src/components/layout/PageHeader.tsx` | prop `variant?: 'card' \| 'plain'` (default `'card'`), prop `topRight?: ReactNode`, corrige "Início" duplicado |
| `src/components/layout/SidebarNavItem.tsx` | estilo do item ativo (borda + glow) via tokens; altura 44 |
| `src/components/layout/Sidebar.tsx` | logo 44px radius 12; busca h44 |
| `src/components/contacts/ContactsView.tsx` | usa `variant="plain"`, `topRight={<ContactsTopActions/>}`, tabs novas, KPIs com hook novo |
| `src/components/contacts/ContactDialogs.tsx` | botão Novo Contato: `bg-success` h-12 |
| `src/components/contacts/ContactToolbar.tsx` | alturas 44, Agrupar → dentro de Colunas, ordem dos controles |
| `src/components/contacts/ContactViewSwitcher.tsx` | **reescrita autorizada**: segmentado azul + Colunas com seção Agrupamento |
| `src/components/contacts/ContactSearchWithSuggestions.tsx` | input h-11, ícone, placeholder |
| `src/components/contacts/FilterPresets.tsx` | label "Filtros Salvos", h-11, ícone Bookmark |
| `src/components/contacts/ContactResultsSummary.tsx` | tipografia + botões 36×36 |
| `src/components/contacts/ContactStatsCards.tsx` | **reescrita autorizada**: consome `useContactsKpi`, tiles, sparkline line/bars |
| `src/components/contacts/ContactCard.tsx` | avatar 64, badge pill, rodapé com botões 36×36 bordados, min-h, data honesta |
| `src/components/contacts/contactTypeConfig.tsx` | `badgeClass` receita navy (fill 15% / borda 60% / texto 80%) |
| `src/components/contacts/ContactContentArea.tsx` | grid gap-3 → `gap-3` (12px) já ok; garantir `xl:grid-cols-4` |
| `src/components/contacts/ContactsSkeleton.tsx` | shape do card novo (64px avatar, 3 linhas, rodapé) |
| `src/components/contacts/ContactListItem.tsx`, `ContactsTable.tsx`, `ContactDetailPanel.tsx` | só harmonização de cor/altura (Fase 9) |

### 3.2 Arquivos novos
| Arquivo | Conteúdo |
|---|---|
| `src/hooks/crm/useContactsKpi.ts` | query `contacts` (created_at, contact_type, company) → agregados e séries |
| `src/components/contacts/ContactsTopActions.tsx` | busca global (dispara `open-global-search`), sino, avatar iniciais |
| `src/components/contacts/ContactTypeTabs.tsx` | tabs pill com `layoutId` (extraído do JSX inline do ContactsView) |
| `src/components/contacts/ContactKpiCard.tsx` | card KPI + `Sparkline` (line/bars) + `CountUp` |
| `docs/design/REDESIGN_CONTATOS_STATUS.md` | ledger de checkpoints (template no Apêndice F) |
| `/workspace/qa/*` (fora do repo) | scripts de screenshot, medida e diff (Apêndice E) |

### 3.3 O que NÃO tocar
`supabase/`, `src/integrations/supabase/types.ts`, `sidebarNavConfig.ts` (estrutura do menu), `ViewRouter`, `AppShell`, `vite.config.ts`, `eslint.config.js`, qualquer `deployment-manifest`, testes fora de `src/components/contacts/__tests__` (a não ser que quebrem por classe/texto alterado — aí atualize o teste, nunca o comportamento).

---

## 4. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP12)
Busca (nome/telefone/email/empresa) e sugestões · CRM 360° · Sincronizar · Novo/Editar/Excluir contato (+ diálogo de sucesso com protocolo) · abrir conversa (`openContactChat` → inbox) · seleção individual e Selecionar todos (Ctrl+A) · Tags em massa · Comparar · Mesclar · BulkActionsBar · Filtros avançados (empresa/cargo/tag/período) · Filtros salvos (presets) · ordenação (5 opções) · tabs por tipo (contagem via `contacts_count_by_type`) · agrupar por empresa · paginação 50 (Página X de Y, ‹ ›) · Cards/Lista/Tabela/Pipeline/Mapa/Analytics · colunas 3–6 · painel de detalhes (Esc fecha) · atalhos Ctrl+N / Esc · loading skeleton · empty state · CompanyLogo/avatar · permissões · responsivo/mobile.

---

## 5. O PLANO — 100 ETAPAS · 12 FASES · 13 CHECKPOINTS

Formato: `[ ] N. Ação — arquivo — DoD (definição de pronto)`. Marque `[x]` **só** com a evidência no ledger.

### FASE 0 — Preparação e diagnóstico (etapas 1–9) → CP0

- [ ] **1.** Localize o repo: `ls /workspace/repos | grep -i zapp`. Use o diretório que contém `package.json` com `"name": "zapp-web-v2"`. Registre o caminho no ledger. — DoD: caminho absoluto no ledger.
- [ ] **2.** `git fetch --all && git checkout main && git pull && git rev-parse HEAD`. Deve ser `e9d06a3` ou posterior. — DoD: SHA no ledger.
- [ ] **3.** Se existir `graphify-out/GRAPH_REPORT.md`, leia antes de qualquer grep e confira frescura (commit do report = HEAD; senão `graphify update . --force`). Use `graphify explain "ContactsView"` e `graphify path "ContactsView" "tokens.css"` para confirmar o mapa da seção 1. — DoD: divergências (se houver) anotadas.
- [ ] **4.** `git checkout -b redesign/contatos-navy-v2`. — DoD: `git branch --show-current` = nome da branch.
- [ ] **5.** Crie `docs/design/REDESIGN_CONTATOS_STATUS.md` a partir do template do Apêndice F. Commit `chore(contatos): ledger do redesign navy`. — DoD: arquivo commitado.
- [ ] **6.** Se `docs/design/contatos-reference.png` existir no repo, copie para `/workspace/qa/ref.png` e E.4 fica habilitado. Se **não** existir, registre `E.4: pulado (sem PNG no repo)` no ledger e siga — E.2 (geometria) e E.3 (cores) são os gates obrigatórios e não dependem do PNG. Não pare por isso. — DoD: linha no ledger.
- [ ] **7.** Instale as ferramentas de QA **fora do repo**: `mkdir -p /workspace/qa && cd /workspace/qa && npm init -y && npm i playwright@1.56 pngjs pixelmatch && npx playwright install chromium`. Se `install chromium` falhar por dependência de sistema, tente `npx playwright install --with-deps chromium`; se ainda falhar, registre no ledger e use o Plano B da Fase 11 (browser MCP). — DoD: `node -e "require('playwright')"` sem erro **ou** bloqueio registrado.
- [ ] **8.** Credencial de QA: `grep -E 'ZAPP_QA_(EMAIL|PASSWORD)' /workspace/.secrets/zapp-v2.env`. Já existe: usuário `qa.visual@promobrindes.com.br` (role `supervisor`, criado 06/09/2026, lê a base inteira via RLS) com `ZAPP_QA_EMAIL`, `ZAPP_QA_PASSWORD`, `ZAPP_SUPABASE_URL` e `ZAPP_SUPABASE_ANON_KEY` gravados em `/workspace/.secrets/zapp-v2.env` (volume persistente; `/root/.secrets` é só symlink). Não recrie o usuário. — DoD: `curl` de login (`/auth/v1/token?grant_type=password`) retorna `access_token`.
- [ ] **9.** Baseline atual: `npm ci` (ou `bun install --frozen-lockfile`), depois `npm run typecheck && node scripts/ci/lint-ratchet.mjs && node scripts/ci/typecheck-ratchet.mjs && npm run implicit-any-check && npx vitest run src/components/contacts`. Tudo verde **antes** de mexer. — DoD: 5 comandos com exit 0, saída resumida no ledger.

**CP0 — Ambiente pronto.** Gate: etapas 1–9 com evidência. Screenshot "ANTES": rode o Apêndice E.1 contra `https://zapp-web-v2.vercel.app` e salve `/workspace/qa/out/00-before.png`. Sem esse arquivo, CP0 não fecha.

---

### FASE 1 — Fundação: fonte, tokens navy, armadilha do skin (etapas 10–22) → CP1

- [ ] **10.** `index.html`: trocar o `<link rel="preload">` e o `<link rel="stylesheet">` do Google Fonts por `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap`. Manter os `preconnect`. — DoD: nenhuma menção a `Outfit` ou `Plus+Jakarta` no `index.html`.
- [ ] **11.** `index.html`: nos dois `font-family:Outfit,...` inline (boot spinner e tela de erro) → `Inter,system-ui,sans-serif`. — DoD: `grep -c Outfit index.html` = 0.
- [ ] **12.** `src/index.css` e `src/styles/tokens.css`: `--font-sans: 'Inter', system-ui, sans-serif;` e `--font-display: 'Inter', system-ui, sans-serif;`. Adicionar em `base.css` (ou `index.css`): `h1,h2,h3,.font-display{letter-spacing:-0.02em}` e `body{font-feature-settings:"cv11","ss01"}` (opcional; se Inter da Google não expuser, sem efeito). — DoD: `grep -rn "Outfit\|Jakarta" src/ | wc -l` = 0.
- [ ] **13.** `src/styles/tokens.css` bloco `.dark`: substituir **exatamente** as linhas listadas no Apêndice A (background, foreground, card, card-elevated, popover, popover-foreground, muted, muted-foreground, accent, accent-foreground, border, input, ring, primary, primary-glow, success, warning, sidebar-*, chat-bubble-received, chat-header, chat-input-bg, elevated, elevated-hover, glass-bg, glass-border, gradient-surface, gradient-divider, shadow-glow-*). Não apagar tokens que não estão na lista. — DoD: `git diff --stat src/styles/tokens.css` só toca o bloco `.dark`, mais as linhas do passo 14.
- [ ] **14.** `tokens.css` `:root`: `--sidebar-w: 234px`; `--layout-gutter: 2.25rem`; adicionar `--kpi-tile-blue`, `--kpi-tile-blue-fg`, `--kpi-tile-green`, `--kpi-tile-green-fg`, `--kpi-tile-purple`, `--kpi-tile-purple-fg`, `--kpi-tile-yellow`, `--kpi-tile-yellow-fg` (valores no Apêndice A) e `--page-glow`. — DoD: 10 tokens novos presentes.
- [ ] **15.** `tailwind.config.ts` → `theme.extend.colors`: adicionar `kpi: { blue: 'hsl(var(--kpi-tile-blue))', 'blue-fg': 'hsl(var(--kpi-tile-blue-fg))', ... }` para os 4 tiles. — DoD: `bg-kpi-blue`, `text-kpi-blue-fg` compilam (build sem warning de classe).
- [ ] **16.** Grep de cores hardcoded que ignoram tokens: `grep -rnE "hsl\(240[ ,]|#0[0-9a-f]{5}\b|rgb\(2[0-9]," src/styles src/components/layout src/components/contacts`. Cada ocorrência em fundo/borda/sidebar → trocar por token. Registrar a lista no ledger. — DoD: zero ocorrências em `src/styles/*.css` e `src/components/layout/*` para fundo/borda.
- [ ] **17.** Glow da página: em `src/styles/base.css`, na regra do `body` (ou `#root`) do `.dark`: `background-image: var(--page-glow);` `background-attachment: fixed;` `background-repeat: no-repeat;`. Se `AppShell` usa `bg-background` opaco no wrapper e esconde o glow, aplicar o glow no `main#main-content` via classe utilitária `.page-glow` em `utilities.css`. — DoD: screenshot mostra halo azul sutil no canto superior esquerdo.
- [ ] **18.** `presets.ts` → `buildPreset` bloco `dark`: substituir os neutros por navy (Apêndice B). `muted-foreground` → `215 22% 66%`. — DoD: `grep -n "240 8% 6%\|240 7% 11%" src/components/settings/theme/presets.ts` = 0.
- [ ] **19.** `presets.ts`: exportar `export const STORAGE_VERSION = 2;`. Localizar quem lê/escreve `STORAGE_KEY` (`grep -rn "theme-custom-colors\|STORAGE_KEY" src/`). No **leitor**: se `stored.v !== STORAGE_VERSION` → `localStorage.removeItem(STORAGE_KEY)` e tratar como sem skin. No **escritor**: sempre gravar `v: STORAGE_VERSION`. — DoD: teste manual no console: skin antigo sem `v` some no reload.
- [ ] **20.** `index.html` boot script: dentro do `if (skin)`, envolver a aplicação de `cssVarsCache` em `if (c.v === 2) { ... } else { localStorage.removeItem('theme-custom-colors'); }`. — DoD: código presente; lint do HTML não aplicável.
- [ ] **21.** `npm run build` — deve passar. `npm run typecheck` — zero erros. — DoD: exit 0 nos dois.
- [ ] **22.** Commit `redesign(contatos): fase 1 — Inter + tokens navy + invalidação de skin v2`. Push. Aguardar Vercel preview READY (`https://zappwebv2-git-redesign-contatos-navy-v2-juca1.vercel.app`). — DoD: URL do preview + estado READY no ledger.

**CP1 — Paleta e fonte.** Rode Apêndice E.1 (screenshot) e E.3 (assert de cores) contra o **preview**. Gate: as 6 amostras de cor (fundo, card, sidebar, primary, success, input) dentro de ΔE ≤ 6 da referência; `document.fonts.check('16px Inter')` = true. Sem isso, **não avance** — corrija tokens primeiro.

---

### FASE 2 — Shell: sidebar e ritmo da página (etapas 23–30) → CP2

- [ ] **23.** `SidebarNavItem.tsx`: item h-11 (44px), `rounded-[10px]`, px-3, gap-3, texto 15/500, ícone 18px. Estado ativo: `bg-sidebar-accent text-sidebar-accent-foreground border border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/.25),0_6px_18px_-8px_hsl(var(--primary)/.6)]`. Hover: `bg-muted/60`. Manter `aria-current`, tooltip, badge. — DoD: `getBoundingClientRect().height` do item ativo = 44 ±2.
- [ ] **24.** `Sidebar.tsx`: logo tile `w-11 h-11 rounded-xl` (44px) e texto "ZAPP" 18/700 tracking -0.02em; linha do logo `h-[64px]`. — DoD: medida 44×44 ±2.
- [ ] **25.** `Sidebar.tsx`: caixa "Buscar… ⌘K" h-11, `rounded-xl`, borda sólida `border-border` (não tracejada), fundo `bg-input`. — DoD: altura 44 ±2.
- [ ] **26.** `SidebarNavGroup.tsx`: label do grupo 12/600, `tracking-[0.06em]`, `text-muted-foreground`, chevron à direita; item h-10. Não alterar `sidebarNavConfig.ts`. — DoD: grupos legíveis, estrutura intacta.
- [ ] **27.** `AgentProfilePopover` (rodapé): avatar 36 com iniciais, nome 15/600, status "Online" com dot `bg-success` 8px. Só cor/tamanho. — DoD: dot verde `#00d464` ±ΔE 6.
- [ ] **28.** `src/styles/sidebar.css`: remover qualquer cor hardcoded restante (do grep da etapa 16). — DoD: arquivo só usa `hsl(var(--…))`.
- [ ] **29.** Verificar que `--layout-gutter: 2.25rem` não quebra views full-screen (inbox, pipeline usam `fullScreen`/`ownScroll` — não recebem gutter). Abrir dashboard e inbox no preview. — DoD: 2 screenshots (`02-dashboard.png`, `02-inbox.png`) sem overflow horizontal.
- [ ] **30.** Commit `redesign(contatos): fase 2 — sidebar navy, item ativo, gutter 36px`. Push. — DoD: preview READY.

**CP2 — Shell.** Gate: E.2 (geometria) reporta `sidebar=234±4`, `navItemActive=44±2`, `logo=44±2`. Screenshot `02-after.png` no ledger.

---

### FASE 3 — Header, breadcrumb e ações do topo (etapas 31–39) → CP3

- [ ] **31.** `PageHeader.tsx`: adicionar props `variant?: 'card' | 'plain'` (default `'card'`) e `topRight?: React.ReactNode`. Com `plain`: sem `bg-card`, sem `border-b`, `px-0 pt-0 pb-2`. Título `text-[38px] font-extrabold tracking-[-0.02em] leading-none`; subtítulo `text-lg text-muted-foreground mt-2`. Linha 1 = breadcrumb à esquerda + `topRight` à direita (`h-14 items-center`). — DoD: `variant` ausente → markup idêntico ao atual (snapshot de outra view não muda).
- [ ] **32.** `PageHeader.tsx`: corrigir duplicidade — quando `breadcrumbs[0].label === 'Início'`, renderizar o ícone Home **junto** desse item (ícone + "Início" visível) e não gerar o item Home separado. Último item `font-semibold text-foreground`. — DoD: DOM tem um único "Início".
- [ ] **33.** Criar `ContactsTopActions.tsx`: `[input 220×36 "Buscar no sistema…" ícone Search]` (onFocus/onClick → `document.dispatchEvent(new CustomEvent('open-global-search'))` e `blur()`), `[botão sino 36×36]`, `[avatar 36 iniciais]` (nome via `useAuth().profile`, `getInitials` de `@/lib/avatar-colors`). Sino: descubra por `grep -rn "unreadNotifications\|NotificationCenter\|open-notifications" src/` qual mecanismo abre notificações; use-o. Se nenhum for reutilizável, o sino navega para a view de notificações existente (`grep notifications src/pages/ViewRouter.tsx`). Não invente componente de notificação. — DoD: os 3 elementos funcionam (busca abre paleta; sino faz algo real; avatar mostra iniciais reais).
- [ ] **34.** `ContactsView.tsx`: `<PageHeader variant="plain" topRight={<ContactsTopActions />} …/>`. Manter `breadcrumbs`, `title`, `subtitle` (formatar `totalCount` com `toLocaleString('pt-BR')` → "1.516"). — DoD: subtítulo "Base de clientes e leads (1.516 contatos)".
- [ ] **35.** Botão CRM 360°: `h-12 px-5 rounded-xl bg-primary/20 border border-primary/50 text-primary-glow hover:bg-primary/30 font-semibold text-base gap-2` + `Sparkles` 18px. — DoD: 48px de altura, cor ΔE ≤ 8 do `#042159`.
- [ ] **36.** Botão Sincronizar: `h-12 px-5 rounded-xl bg-card border border-border text-foreground hover:bg-muted font-semibold text-base gap-2` + `RefreshCw` (spin quando `loading`). — DoD: 48px.
- [ ] **37.** `ContactDialogs.tsx` trigger: `className="h-12 px-5 rounded-xl bg-success hover:bg-success/90 text-white font-semibold text-base gap-2 shadow-[0_8px_24px_-10px_hsl(var(--success)/.7)]"`, ícone `Plus` 18px `strokeWidth={2.5}`. Botão "Continuar" do diálogo de sucesso: `bg-success`. — DoD: cor `#00d464` ΔE ≤ 6.
- [ ] **38.** Envolver os 3 botões em `motion.div whileTap={{scale:.98}}` **ou** usar `motion(Button)`; respeitar `useReducedMotion`. — DoD: sem warning de ref no console.
- [ ] **39.** Commit `redesign(contatos): fase 3 — header plain, top actions, botões 48px`. Push. — DoD: preview READY; typecheck 0.

**CP3 — Header.** Gate: E.2 → `headerBtn=48±2`, `title≈38px` (computed font-size), `topRightSearch=220×36±4`. Screenshot `03-after.png`.

---

### FASE 4 — KPIs com dados reais (etapas 40–50) → CP4

- [ ] **40.** Descobrir se `search_contacts`/`contacts_count_by_type` filtram `is_lid_legacy`: `grep -rn "is_lid_legacy" supabase/migrations | head`. Anotar no ledger. A KPI **Total** deve usar `contactCountByType.all` (mesma fonte das tabs) — nunca outro número. — DoD: decisão registrada.
- [ ] **41.** Criar `src/hooks/crm/useContactsKpi.ts` (Apêndice C): `useQuery(['contacts-kpi'])` → `supabase.from('contacts').select('created_at, contact_type, company')` (aplicar `.eq('is_lid_legacy', false)` **somente** se a RPC das tabs também filtrar). `staleTime: 60_000`. Retorna: `novos30`, `novosPrev30`, `deltaNovosPct`, `deltaTotalPct` (= novos30 / max(total − novos30, 1)), `empresasDistinct`, `leadsTotal`, `leads30`, `deltaLeadsPct`, `seriesTotalCumulative12w`, `seriesNovosDaily30`, `seriesEmpresasWeekly12`, `seriesLeadsWeekly12`. — DoD: hook tipado, sem `any`, teste unitário das agregações com dataset sintético (`__tests__/useContactsKpi.test.ts`).
- [ ] **42.** Criar `ContactKpiCard.tsx`: props `{ label, value, deltaPct: number|null, deltaLabel?: string, tile: 'blue'|'green'|'purple'|'yellow', icon, series: number[], chart: 'line'|'bars' }`. Layout: `h-[108px] rounded-[14px] border border-border/70 bg-[linear-gradient(135deg,hsl(var(--card-elevated)),hsl(var(--card)))] p-4 flex items-center gap-4`. Tile 60×60 `rounded-xl bg-kpi-{tile}` com ícone 26px `text-kpi-{tile}-fg`. Coluna: label 15/500 muted; linha valor 34/700 tabular + delta 14/600 (↑ `TrendingUp` 14px + `+85%` verde / ↓ vermelho / "sem alteração" muted sem seta); "vs. período anterior" 14 muted/80 (ou "sem alteração" quando delta = 0 → o rótulo vai **no lugar** do delta, e a linha 3 fica "sem alteração"). Sparkline à direita 96×40. — DoD: 4 cards h 108 ±6.
- [ ] **43.** `Sparkline` (dentro de `ContactKpiCard.tsx`): modo `line` = path suave (Catmull-Rom → bezier) stroke 2px + área gradient 0.25→0 + ponto final 3px; modo `bars` = 7 barras `rx-1`, largura 6, gap 4, altura proporcional, cor sólida. Cor = `text-kpi-{tile}-fg` via `currentColor`. `motion.path` com `pathLength` 0→1 700ms. **Sem dado (série vazia ou soma 0) → não renderiza nada** (nem placeholder). — DoD: KPI "Empresas" com 0 empresas não mostra sparkline.
- [ ] **44.** `CountUp`: `useMotionValue(0)` + `animate(0 → value, {duration:.6, ease:'easeOut'})`, `useTransform` para `toLocaleString('pt-BR')`. Com `useReducedMotion()` → renderiza valor direto. — DoD: "1.516" com ponto de milhar.
- [ ] **45.** **Reescrever** `ContactStatsCards.tsx`: remove todo cálculo local; consome `useContactsKpi()` + props `totalAll` (= `contactCountByType.all`), `leadsAll` (= `contactCountByType.lead ?? 0`). Grid `grid-cols-2 xl:grid-cols-4 gap-3`. Cards: Total (blue, `Users`, line, série cumulativa), Novos 30d (green, `UserPlus`, bars, série diária agrupada em 7 buckets), Empresas (purple, `Building2`, line), Leads (yellow, `Zap`, line). Manter export `ContactStatsCards` e a assinatura de props **compatível** (props antigas aceitas e ignoradas, para não quebrar `ContactsView` até a etapa 46). — DoD: arquivo ≤ 160 linhas.
- [ ] **46.** `ContactsView.tsx`: passar `totalAll={contactCountByType['all'] ?? 0}` e `leadsAll={contactCountByType['lead'] ?? 0}`; remover props obsoletas. Ao clicar Sincronizar: além de `refetch()`, `queryClient.invalidateQueries({ queryKey: ['contacts-kpi'] })` e `['contacts-type-counts']`. — DoD: valor do KPI Total = badge da tab "Todos".
- [ ] **47.** `useContactsCRUD.ts`: após add/edit/delete bem-sucedidos, invalidar `['contacts-kpi']` (junto do `searchHook.refetch()` já existente). — DoD: criar contato → KPI Novos incrementa sem reload.
- [ ] **48.** Skeleton dos KPIs enquanto `isLoading` do hook: 4 caixas h-[108px] `animate-shimmer`. — DoD: sem layout shift (CLS) ao carregar.
- [ ] **49.** Testes: atualizar/criar `__tests__/ContactStatsCards.test.tsx` mockando `useContactsKpi` (valores, delta positivo/negativo/zero, sparkline ausente). `npx vitest run src/components/contacts` verde. — DoD: exit 0.
- [ ] **50.** Commit `redesign(contatos): fase 4 — KPIs com dados reais (hook contacts-kpi), tiles e sparklines`. Push. — DoD: preview READY.

**CP4 — KPIs.** Gate: E.2 → `kpiCard=108±6`, `kpiTile=60±2`, 4 colunas em 1672. Cores dos 4 tiles ΔE ≤ 8. Valor Total == badge "Todos" (assert no E.2). Screenshot `04-after.png`.

---

### FASE 5 — Tabs de tipo (etapas 51–56) → CP5

- [ ] **51.** Criar `ContactTypeTabs.tsx` movendo o bloco `<Tabs>` inline de `ContactsView.tsx` (mesmas props: `activeTab`, `setActiveTab`, `contactCountByType`, `CONTACT_TYPES`, `CONTACT_TYPE_ICONS`). Manter Radix `Tabs` por acessibilidade (roving tabindex, setas). — DoD: comportamento idêntico, `ContactsView` importa o novo componente.
- [ ] **52.** Container: `h-[52px] rounded-[14px] border border-border/70 bg-card p-1.5 flex items-center gap-1 overflow-x-auto scrollbar-thin`. `TabsList` sem `flex-wrap` (scroll horizontal em telas menores; `snap-x`). — DoD: em 1672 cabem todos sem scroll; em 1280 rola sem quebrar linha.
- [ ] **53.** `TabsTrigger`: `relative h-10 px-4 rounded-[10px] text-[15px] font-medium text-muted-foreground gap-2 data-[state=active]:text-foreground data-[state=active]:font-semibold`. Ícone 18px. Sem `shadow-sm`, sem `bg-background`. — DoD: pill ativa h 40 ±2.
- [ ] **54.** Pill deslizante: dentro de cada trigger, se ativo, `<motion.span layoutId="contacts-type-pill" className="absolute inset-0 rounded-[10px] bg-accent border border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/.2)] -z-10" transition={{type:'spring',stiffness:400,damping:32}}/>`. `LayoutGroup id="contacts-tabs"` ao redor. — DoD: troca de tab anima; sem flicker; reduced-motion → sem animação.
- [ ] **55.** Badge de contagem: ativa `bg-primary text-white`, inativa `bg-muted text-muted-foreground`; `h-6 px-2 rounded-full text-[12.5px] font-semibold tabular-nums`; número com `toLocaleString('pt-BR')`. Só renderizar quando `count > 0` (exceto "Todos", sempre). — DoD: "1.516" na tab Todos.
- [ ] **56.** Commit `redesign(contatos): fase 5 — tabs pill com layoutId`. Push. — DoD: preview READY.

**CP5 — Tabs.** Gate: E.2 → `tabBar=52±4`, `tabActive=40±2`, `tabTodosWidth≈152±12`. Screenshot `05-after.png`.

---

### FASE 6 — Toolbar, segmentado e Colunas (etapas 57–65) → CP6

- [ ] **57.** `ContactSearchWithSuggestions.tsx`: wrapper `flex-1 min-w-[320px]`; input `h-11 rounded-xl bg-input border-border text-[15px] pl-11 placeholder:text-muted-foreground/70`; ícone `Search` 18px absoluto à esquerda (`left-4`). Placeholder exato: "Buscar por nome, telefone, email ou empresa…". Popover de sugestões mantém lógica. — DoD: h 44 ±2; sugestões funcionam.
- [ ] **58.** `ContactToolbar.tsx` sort: `SelectTrigger className="h-11 w-[150px] rounded-xl bg-input border-border text-[15px] font-medium gap-2"` com ícone `ArrowUpDown` 18px (troca `SortAsc`). Rótulos mantidos. — DoD: "Nome (A-Z)" com chevron.
- [ ] **59.** Botão Filtros: `h-11 px-4 rounded-xl bg-input border border-border text-[15px] font-medium gap-2` + `Filter` 18px; ativo (`showFilters`) → `bg-primary text-white border-primary`. Badge de contagem mantida. "Limpar" mantido (aparece só com filtros). — DoD: h 44.
- [ ] **60.** `FilterPresets.tsx`: trigger com ícone `Bookmark` 18px e rótulo **"Filtros Salvos"**, mesma classe da etapa 59. Conteúdo do dropdown inalterado. — DoD: texto exato.
- [ ] **61.** **Reescrever** `ContactViewSwitcher.tsx` (Apêndice D): grupo `h-11 rounded-xl border border-border bg-card p-1 flex gap-1`; 3 botões `h-9 px-4 rounded-[10px] text-[15px] font-medium gap-2` com pill `layoutId="contacts-view-pill"` `bg-primary` e texto branco quando ativo; ícones `LayoutGrid`/`List`/`Table2` 18px; rótulos "Cards", "Lista", "Tabela" **sempre visíveis** (≥ md). 4º item "Mais ▾" (dropdown Pipeline/Mapa/Analytics) mantido; quando um deles está ativo, o item mostra ícone+nome do ativo com pill. — DoD: larguras Cards≈100/Lista≈94/Tabela≈105 ±8.
- [ ] **62.** Botão "Colunas" (`Settings2` 18px + "Colunas", `h-11 px-4 rounded-xl bg-input border-border`): dropdown com **duas seções**: "Colunas" (3–6, igual hoje) e "Agrupamento" (item "Por empresa" com check — movido do botão `LayoutList` de `ContactToolbar`). Remover o botão `LayoutList` isolado. `setGroupByCompany` continua ligado. — DoD: agrupar por empresa funciona a partir de Colunas.
- [ ] **63.** Ordem final na linha: `[Busca flex-1] [Sort] [Filtros] [Filtros Salvos] [Tags/Comparar/Mesclar — só com seleção] … [ml-auto] [Segmentado] [Colunas]`. Container `flex items-center gap-3 flex-nowrap` em ≥ xl; `flex-wrap` abaixo. — DoD: em 1672 tudo em uma linha.
- [ ] **64.** Painel de filtros avançados (`ContactAdvancedFilters`): só harmonizar (`rounded-[14px] border-border bg-card p-4`, selects h-10). — DoD: filtros aplicam igual.
- [ ] **65.** Commit `redesign(contatos): fase 6 — toolbar 44px, segmentado azul, Colunas + Agrupamento`. Push. — DoD: preview READY.

**CP6 — Toolbar.** Gate: E.2 → `toolbarControls=44±2` (busca, sort, filtros, presets, segmentado, colunas), uma linha em 1672 (`offsetTop` igual para todos ±2). Screenshot `06-after.png`.

---

### FASE 7 — Linha de resultados e paginação (etapas 66–69) → CP7

- [ ] **66.** `ContactResultsSummary.tsx`: container `h-9 flex items-center justify-between text-sm text-muted-foreground`. Esquerda: `Checkbox` 18px `rounded-[5px] border-border` + "Selecionar todos" (ou "N selecionados") 14/500; separador `h-4 w-px bg-border`; "Exibindo **50** de **1516** contatos" (números `font-semibold text-foreground`, **sem** ponto de milhar aqui — igual ao mockup). — DoD: texto exato.
- [ ] **67.** Direita: "Página **1** de **38**" 14/500 + dois botões `w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted disabled:opacity-40` com `ChevronLeft/Right` 18px. Handlers `loadPrevious`/`loadMore` mantidos, `aria-label` mantidos. — DoD: 36×36 ±2.
- [ ] **68.** `ContactsView.tsx`: a linha só some quando `filteredCount === 0` (comportamento atual) — manter. Espaçamento vertical entre blocos da página: `space-y-4` (16px) → ajustar para `space-y-3` entre toolbar→resultados→grid e `space-y-4` acima (header→KPIs→tabs→toolbar). — DoD: distâncias batem com 2.3 (KPI→tabs 18±4, tabs→toolbar 18±4, toolbar→linha 20±4, linha→cards 18±4).
- [ ] **69.** Commit `redesign(contatos): fase 7 — linha de resultados e paginação 36px`. Push.

**CP7 — Resultados.** Gate: E.2 → `pagerBtn=36±2`. Screenshot `07-after.png`.

---

### FASE 8 — Cards, badges e skeleton (etapas 70–79) → CP8

- [ ] **70.** `contactTypeConfig.tsx`: para **todas** as chaves, `badgeClass` passa a seguir a receita `border-[hsl(H_S%_L%)]/60 text-[hsl(H_S%_80%)] bg-[hsl(H_S%_L%)]/15` (mesma matiz de hoje). Para `cliente` usar a matiz do primary (`217 100% 54%`). Manter `gradient`, `dotBg`, `iconNode`, `label`. — DoD: badge Cliente ΔE ≤ 8 de `#042255` (fundo) e texto azul-claro legível (contraste ≥ 4.5:1).
- [ ] **71.** `ContactCard.tsx`: wrapper `rounded-[14px] border border-border/70 bg-card min-h-[164px] p-4`; hover `hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/.35)] transition-[transform,border-color,box-shadow] duration-150`; selecionado `ring-1 ring-primary border-primary/60 bg-primary/5`. Remover `hover:bg-muted/20` e `shadow-black/10`. — DoD: card h ≥ 164.
- [ ] **72.** Avatar `w-16 h-16` (64px) `ring-2 ring-border/70`; fallback iniciais 18/700 com `getAvatarColor` (manter). Nome `text-base font-semibold leading-tight truncate pr-8`. Badge tipo `h-6 px-2.5 rounded-full text-[12.5px] font-medium mt-1.5 gap-1.5` (ícone 12px). — DoD: 64×64 ±2; badge h 24 ±2.
- [ ] **73.** Linha empresa: `text-[13.5px] text-muted-foreground` **sem** ícone Building2 (mockup não tem), abaixo do badge, `mt-1`. Se `companyName` (CRM) existir, prioriza; senão `contact.company`; se nenhum, omitir a linha (o `min-h` segura a altura). — DoD: sem ícone, sem espaço vazio visível.
- [ ] **74.** Telefone e email: linhas `flex items-center gap-2 text-[13.5px]`; ícones `Phone`/`Mail` 15px `text-muted-foreground`; telefone `font-normal` (remover `font-mono`) cor `text-foreground/80`; email `text-[hsl(215_30%_78%)]`. Links `wa.me`/`mailto:` mantidos. `mt-3 space-y-1.5`. — DoD: sem monospace.
- [ ] **75.** Rodapé: `mt-auto pt-3 flex items-center justify-between` (card vira `flex flex-col`). Esquerda: `Clock` 14px + texto 12.5 muted/80. Direita: dois botões `w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50` com `MessageSquare`/`Pencil` 16px. Handlers `onOpenChat`/`onEdit` mantidos, `title` mantidos. — DoD: 36×36 ±2.
- [ ] **76.** Data honesta: `grep -n "last_message_at\|last_interaction\|updated_at" src/integrations/supabase/types.ts | head`. Se `contacts` tiver `last_message_at`: rótulo "Último contato em {last_message_at}" quando existir, senão "Cadastrado em {created_at}". Se não houver coluna de último contato, usar sempre "Cadastrado em {created_at}". Formato `dd MMM yyyy` ptBR. — DoD: nenhum card chama `created_at` de "último contato".
- [ ] **77.** Kebab (`MoreVertical`) `top-3 right-3` botão 32×32 ghost; checkbox de seleção `top-3 left-3` aparece em hover/seleção (manter). Menu: Conversar / Editar / Excluir (manter). — DoD: itens do menu funcionam.
- [ ] **78.** `ContactsSkeleton.tsx`: card skeleton com mesma shape (círculo 64, 3 barras, rodapé com 2 quadrados 36), h-[164px], `animate-shimmer`; `ContactContentArea.tsx` grid `gap-3` e colunas `gridColumns` → classes `xl:grid-cols-{n}` já existentes (confirmar que 4 é o default e rende 4 em 1672). — DoD: skeleton e card têm a mesma altura (sem pulo).
- [ ] **79.** Commit `redesign(contatos): fase 8 — cards 164px, avatar 64, badges navy, rodapé 36px, data honesta`. Push.

**CP8 — Cards.** Gate: E.2 → `card≥164`, `avatar=64±2`, `footerBtn=36±2`, 4 colunas, gap 12±2. E.3 → badge Cliente e card bg dentro de ΔE 8. Screenshot `08-after.png`. **Este é o checkpoint mais importante da entrega — se E.4 estiver habilitado, gere também o composite `08-compare.png` e olhe para ele.**

---

### FASE 9 — Lista, tabela, detalhes, diálogos, empty (etapas 80–85) → CP9

- [ ] **80.** `ContactListItem.tsx`: linha h-16, avatar 40, badge pill igual ao card, ações 36×36 à direita, hover `bg-muted/40`. Sem mudar props. — DoD: modo Lista coerente.
- [ ] **81.** `ContactsTable.tsx`: `thead` `bg-muted/40 text-[13px] font-semibold uppercase-none tracking-normal`, linhas h-14, bordas `border-border/60`, hover `bg-muted/30`, badge pill. Sorting/inline edit intactos. — DoD: tabela coerente.
- [ ] **82.** `ContactDetailPanel.tsx`: fundo `bg-card`, borda esquerda `border-border`, backdrop já existe (`bg-black/20`) → `bg-background/60 backdrop-blur-sm`; Esc mantido. — DoD: abre/fecha.
- [ ] **83.** Dialogs (`Dialog`, `AlertDialog`) herdam `--popover`/`--card`; verificar contraste dos inputs (`bg-input`) no `ContactForm`. Só classes. — DoD: form legível.
- [ ] **84.** `ContactEmptyState.tsx`: ícone em tile 60 `bg-kpi-blue`, título 18/600, texto muted, botões "Novo contato" (`bg-success`) e "Limpar filtros". — DoD: sem CTA de importação (removido antes).
- [ ] **85.** Commit `redesign(contatos): fase 9 — lista/tabela/detalhe/dialogs harmonizados`. Push.

**CP9 — Views secundárias.** Gate: 3 screenshots (`09-list.png`, `09-table.png`, `09-detail.png`) sem elemento cinza-violeta remanescente (E.3 amostra de fundo ≤ ΔE 6).

---

### FASE 10 — Motion (etapas 86–90) → CP10

- [ ] **86.** `ContactContentArea.tsx` grid: `AnimatePresence mode="wait"` na troca de `viewMode` (fade 120ms). Cards: `motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:.15, delay: Math.min(index,12)*0.02}}` **somente no primeiro mount da página** (flag `useRef`), não ao paginar/filtrar. — DoD: paginação não re-anima.
- [ ] **87.** `useReducedMotion()` em todos os pontos de motion (KPI count-up, sparkline, pills, cards). — DoD: com `prefers-reduced-motion: reduce` (Playwright `emulateMedia`) nenhuma transição > 0ms.
- [ ] **88.** Remover motion residual sem função: `ContactDialogs` (`motion.div` do ícone de sucesso pode ficar), qualquer `animate-pulse` decorativo em contatos. — DoD: `grep -rn "animate-pulse\|animate-float\|glow-pulse" src/components/contacts` = 0 (exceto skeleton shimmer).
- [ ] **89.** Performance: `npm run build` e conferir que o chunk de contatos não cresceu > 8KB gzip vs. `main` (compare `dist/assets/*contacts*` ou o relatório do `bundle-budget.mjs`). — DoD: número no ledger.
- [ ] **90.** Commit `redesign(contatos): fase 10 — motion orquestrado e reduced-motion`. Push.

**CP10 — Motion.** Gate: vídeo não é exigido; evidência = trecho de código + saída do teste de reduced-motion do E.2 (`transitionDurations` todos 0).

---

### FASE 11 — QA visual automatizado (etapas 91–95) → CP11

- [ ] **91.** Rodar E.1 no preview → `/workspace/qa/out/11-final.png` (1672×941, sidebar expandida, skin limpo, tema dark, tab Todos, Cards, página 1). — DoD: arquivo existe.
- [ ] **92.** Rodar E.2 (geometria) → todos os asserts `OK`. Cada `FAIL` → corrigir → repetir (máx 3 iterações; registrar cada iteração no ledger com o que mudou). — DoD: tabela final no ledger.
- [ ] **93.** Rodar E.3 (cores) → todas as amostras ΔE ≤ 8 (fundos ≤ 6). — DoD: tabela no ledger.
- [ ] **94.** (Só se E.4 habilitado na etapa 6; senão registre `pulado` e vá para 95.) Rodar E.4 (composite lado a lado + heatmap pixelmatch) → `11-compare.png`, `11-heatmap.png`. **Olhe** o composite: o que difere deve ser só conteúdo (nomes, fotos, números) e fonte, nunca layout/cor. Registrar `mismatchPct` por região (header, kpi, tabs, toolbar, cards). — DoD: por região, `mismatchPct` ≤ 35% (fontes/conteúdo diferentes explicam o resto); se uma região > 35%, diga **por quê** no ledger.
- [ ] **95.** Modo claro (`localStorage.theme='light'`): screenshot `11-light.png`; nada quebrado (contraste, bordas). Mobile 390×844: `11-mobile.png`; toolbar quebra em linhas sem overflow horizontal; tabs rolam. — DoD: 2 screenshots sem overflow (`document.documentElement.scrollWidth <= innerWidth`).

**Plano B (se Playwright não roda no container):** usar o browser MCP disponível no Claude Code (`claude mcp list` → Cloudflare Browser Rendering / Playwright MCP) contra a URL do preview, com script de login equivalente; se nenhum MCP de browser existir, **pare aqui**, registre "BLOQUEIO: sem renderizador para QA visual" no ledger e entregue as fases 0–10 com o pedido explícito de que Joaquim rode `node /workspace/qa/shot.mjs` — não invente screenshots.

**CP11 — Fidelidade.** Gate: E.2 100% OK, E.3 100% OK, E.4 registrado (ou `pulado`), 11-light e 11-mobile ok.

---

### FASE 12 — QA funcional/técnico, PR e verificação de deploy (etapas 96–100) → CP12

- [ ] **96.** Gates técnicos completos: `npm run typecheck` (0 erros) · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npm run lint` (sem erro novo) · `npx vitest run` (suite inteira, não só contatos) · `npm run build` · `node scripts/ci/bundle-budget.mjs` (se aplicável). — DoD: 8 saídas com exit 0 no ledger.
- [ ] **97.** QA funcional no preview (Playwright, `/workspace/qa/func.mjs` — Apêndice E.5): busca "a" retorna resultados; limpar; tab Cliente filtra; sort "Mais recentes"; Filtros abre; Filtros Salvos abre; selecionar todos → BulkActionsBar aparece; Lista/Tabela/Pipeline/Mapa/Analytics renderizam sem erro no console; Colunas → 3 colunas muda o grid; Agrupar por empresa; página 2 e volta; abrir detalhe e Esc; Novo Contato abre form (não submeter); CRM 360° abre; Sincronizar gira. Console sem `error`. — DoD: 16 checks `OK` no ledger.
- [ ] **98.** Abrir PR `redesign(contatos): Navy Premium — fidelidade à referência (100 etapas)` para `main`. Corpo do PR = seção "Entrega" do ledger (resumo, arquivos, componentes novos, funcionalidades preservadas, resultados dos gates, screenshots `00-before.png` vs `11-final.png` (e a referência, se disponível), pendências). CI verde. — DoD: URL do PR e status dos checks.
- [ ] **99.** Merge (squash) após CI verde. `git checkout main && git pull`. — DoD: SHA do merge.
- [ ] **100.** Verificar deploy de produção: Vercel deployment do SHA do merge em estado `READY` com `target: production`; abrir `https://zapp-web-v2.vercel.app/?view=contacts` com Playwright (skin limpo) e rodar E.3 uma última vez em produção → `12-prod.png`. — DoD: screenshot de produção + asserts de cor OK. **Só então** escreva "concluído".

**CP12 — Entregue.** Gate: PR mergeado, produção verificada, ledger completo com as 13 seções preenchidas e o bloco "Pendências/resíduos" honesto (fonte, fotos reais, séries reais, etc.).

---

## 6. CRITÉRIOS DE ACEITAÇÃO FINAIS
**Visual:** paleta navy em todo o shell + módulo; Inter; header 48px; 4 KPIs 108px com tiles 60; tabs pill 52/40; toolbar 44 em uma linha (≥1440); linha de resultados 36; cards 164/64/36 em 4 colunas gap 12; badges navy; halo azul; nenhum elemento cinza-violeta.
**Dados:** KPI Total == tab Todos; Novos/Empresas/Leads calculados sobre a base inteira; sparkline só com dado; data do card honesta; nomes reais.
**Funcional:** seção 4 integralmente verde.
**Técnico:** typecheck 0, ratchets verdes, testes verdes, build ok, bundle sem estouro, reduced-motion respeitado, light mode intacto, mobile sem overflow.
**Honestidade:** ledger com números e caminhos, nunca adjetivos.

---

## APÊNDICE A — `tokens.css` bloco `.dark` (linhas a substituir)
```css
.dark {
  --background: 216 58% 8%;
  --foreground: 210 40% 98%;
  --card: 215 48% 10%;
  --card-foreground: 210 40% 98%;
  --card-elevated: 215 60% 12%;
  --popover: 216 50% 11%;
  --popover-foreground: 210 40% 98%;
  --primary: 217 100% 54%;
  --primary-foreground: 0 0% 100%;
  --primary-glow: 217 100% 68%;
  --secondary: 213 94% 62%;
  --secondary-foreground: 0 0% 100%;
  --muted: 216 45% 14%;
  --muted-foreground: 215 22% 66%;
  --accent: 217 96% 21%;
  --accent-foreground: 217 100% 85%;
  --destructive: 0 90% 62%;
  --border: 217 40% 16%;
  --input: 216 56% 9%;
  --ring: 217 100% 54%;
  --success: 148 100% 42%;
  --success-foreground: 0 0% 100%;
  --warning: 48 96% 53%;
  --warning-foreground: 0 0% 8%;
  --info: 213 94% 62%;
  --online: 148 100% 42%;
  --sidebar-background: 216 51% 10%;
  --sidebar-foreground: 210 40% 98%;
  --sidebar-primary: 217 100% 54%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 217 96% 21%;
  --sidebar-accent-foreground: 217 100% 85%;
  --sidebar-border: 217 40% 16%;
  --sidebar-ring: 217 100% 54%;
  --chat-bubble-received: 216 45% 14%;
  --chat-header: 215 48% 10%;
  --chat-input-bg: 216 50% 11%;
  --elevated: 215 60% 12%;
  --elevated-hover: 215 55% 15%;
  --glass-bg: 215 48% 10% / 1;
  --glass-border: 217 40% 22% / 1;
  --gradient-surface: linear-gradient(180deg, hsl(215 48% 10%), hsl(216 58% 8%));
  --gradient-divider: linear-gradient(90deg, transparent, hsl(217 40% 30% / .5), transparent);
  --shadow-glow-primary: 0 8px 24px -8px hsl(217 100% 54% / .45);
  --shadow-glow-success: 0 8px 24px -10px hsl(148 100% 42% / .6);
  /* demais tokens do bloco permanecem como estão */
}
:root {
  --sidebar-w: 234px;
  --layout-gutter: 2.25rem;
  --kpi-tile-blue: 217 98% 24%;    --kpi-tile-blue-fg: 217 100% 62%;
  --kpi-tile-green: 168 86% 14%;   --kpi-tile-green-fg: 148 100% 45%;
  --kpi-tile-purple: 244 51% 26%;  --kpi-tile-purple-fg: 258 90% 72%;
  --kpi-tile-yellow: 48 40% 17%;   --kpi-tile-yellow-fg: 48 96% 53%;
  --page-glow: radial-gradient(1100px 520px at 8% -8%, hsl(217 100% 54% / .14), transparent 60%);
}
```

## APÊNDICE B — `presets.ts` `buildPreset` → bloco `dark` (neutros)
```ts
background: `216 58% 8%`,
card: `215 48% 10%`,
'card-elevated': `215 60% 12%`,
popover: `216 50% 11%`,
muted: `216 45% 14%`,
'muted-foreground': `215 22% 66%`,
border: `217 40% 16%`,
input: `216 56% 9%`,
'sidebar-background': `216 51% 10%`,
'sidebar-border': `217 40% 16%`,
'chat-bubble-received': `216 45% 14%`,
'chat-header': `215 48% 10%`,
'chat-input-bg': `216 50% 11%`,
'gradient-surface': `linear-gradient(180deg, hsl(215 48% 10%), hsl(216 58% 8%))`,
'glass-bg': `215 48% 10% / 1`,
elevated: `215 60% 12%`,
'elevated-hover': `215 55% 15%`,
// + export const STORAGE_VERSION = 2;
```

## APÊNDICE C — `src/hooks/crm/useContactsKpi.ts` (esqueleto)
```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type Row = { created_at: string; contact_type: string | null; company: string | null };
const DAY = 86_400_000;

export function aggregateKpi(rows: Row[], now = new Date()) {
  const t = now.getTime();
  const inLast = (r: Row, days: number) => t - Date.parse(r.created_at) < days * DAY;
  const between = (r: Row, from: number, to: number) => { const d = t - Date.parse(r.created_at); return d >= from * DAY && d < to * DAY; };
  const novos30 = rows.filter(r => inLast(r, 30)).length;
  const novosPrev30 = rows.filter(r => between(r, 30, 60)).length;
  const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
  const daily30 = Array.from({ length: 30 }, (_, i) => rows.filter(r => between(r, 29 - i, 30 - i)).length);
  const bucket7 = Array.from({ length: 7 }, (_, i) => daily30.slice(i * 4, i * 4 + 4 + (i === 6 ? 2 : 0)).reduce((a, b) => a + b, 0));
  const weekly = (f: (r: Row) => boolean, weeks = 12) => Array.from({ length: weeks }, (_, i) => rows.filter(r => f(r) && between(r, (weeks - 1 - i) * 7, (weeks - i) * 7)).length);
  const cumulative = (arr: number[], base: number) => arr.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? base) + v], []);
  const olderThan12w = rows.filter(r => !inLast(r, 84)).length;
  const leads = rows.filter(r => r.contact_type === 'lead');
  const empresas = new Set(rows.map(r => r.company?.trim()).filter(Boolean)).size;
  return {
    novos30, novosPrev30, deltaNovosPct: pct(novos30, novosPrev30),
    deltaTotalPct: pct(rows.length, Math.max(rows.length - novos30, 1)),
    empresasDistinct: empresas,
    leadsTotal: leads.length, leads30: leads.filter(r => inLast(r, 30)).length,
    deltaLeadsPct: pct(leads.filter(r => inLast(r, 30)).length, leads.filter(r => between(r, 30, 60)).length),
    seriesTotalCumulative12w: cumulative(weekly(() => true), olderThan12w),
    seriesNovosDaily30: bucket7,
    seriesEmpresasWeekly12: weekly(r => !!r.company),
    seriesLeadsWeekly12: weekly(r => r.contact_type === 'lead'),
  };
}

export function useContactsKpi(filterLidLegacy: boolean) {
  return useQuery({
    queryKey: ['contacts-kpi', filterLidLegacy],
    queryFn: async () => {
      let q = supabase.from('contacts').select('created_at, contact_type, company');
      if (filterLidLegacy) q = q.eq('is_lid_legacy', false);
      const { data, error } = await q;
      if (error) throw error;
      return aggregateKpi((data ?? []) as Row[]);
    },
    staleTime: 60_000,
  });
}
```
Teste unitário obrigatório de `aggregateKpi` com 20 linhas sintéticas (datas fixas, `now` fixo).

## APÊNDICE D — Segmentado (padrão para tabs e view switcher)
```tsx
// item ativo
<button className="relative h-9 px-4 rounded-[10px] text-[15px] font-medium flex items-center gap-2 text-white">
  {isActive && !reduce && (
    <motion.span layoutId="contacts-view-pill" className="absolute inset-0 rounded-[10px] bg-primary -z-10"
      transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
  )}
  {isActive && reduce && <span className="absolute inset-0 rounded-[10px] bg-primary -z-10" />}
  <Icon className="w-[18px] h-[18px]" /> <span>{label}</span>
</button>
```
Inativo: `text-muted-foreground hover:text-foreground hover:bg-muted/60`. Envolver o grupo em `<LayoutGroup id="contacts-view">`.

## APÊNDICE E — Scripts de QA (em `/workspace/qa`, fora do repo)

### E.1 `shot.mjs` — login + screenshot 1672×941
```js
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, url = 'https://zapp-web-v2.vercel.app', out = 'out/shot.png', theme = 'dark', vw = '1672', vh = '941'] = process.argv;
const env = Object.fromEntries(fs.readFileSync('/workspace/.secrets/zapp-v2.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split('=').map(s=>s.trim())));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: 1, locale: 'pt-BR' });
await ctx.addInitScript((t) => { localStorage.removeItem('theme-custom-colors'); localStorage.setItem('theme', t); localStorage.removeItem('sidebar-collapsed'); }, theme);
const page = await ctx.newPage();
const errors = []; page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
if (await page.locator('input[type="email"]').count()) {
  await page.fill('input[type="email"]', env.ZAPP_QA_EMAIL);
  await page.fill('input[type="password"]', env.ZAPP_QA_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/view=|dashboard|inbox/, { timeout: 30000 }).catch(()=>{});
}
await page.goto(url.replace(/\/?$/, '') + '/?view=contacts', { waitUntil: 'networkidle' });
await page.waitForSelector('text=/Exibindo/', { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
fs.mkdirSync('out', { recursive: true });
await page.screenshot({ path: out, fullPage: false });
fs.writeFileSync(out + '.console.json', JSON.stringify(errors, null, 2));
console.log('saved', out, 'consoleErrors', errors.length);
await browser.close();
```
Se o seletor de login for outro, descubra com `page.content()` e ajuste — não chute.

### E.2 `measure.mjs` — geometria + reduced-motion (rodar após login como no E.1; reutilize a página)
```js
// após navegar para ?view=contacts, dentro do mesmo script:
const m = await page.evaluate(() => {
  const q = s => document.querySelector(s); const r = el => el ? el.getBoundingClientRect() : null;
  const fs_ = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  return {
    sidebar: r(q('#main-navigation'))?.width,
    navItemActive: r(q('#main-navigation [aria-current="page"], #main-navigation [data-active="true"]'))?.height,
    title: fs_([...document.querySelectorAll('h1')].find(h=>h.textContent.trim()==='Contatos')),
    headerBtn: r([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Novo Contato')))?.height,
    crmBtn: r([...document.querySelectorAll('button')].find(b=>b.textContent.includes('CRM 360')))?.height,
    kpiCards: [...document.querySelectorAll('[data-testid="kpi-card"]')].map(el=>r(el).height),
    kpiTile: r(q('[data-testid="kpi-tile"]'))?.width,
    tabBar: r(q('[role="tablist"]')?.parentElement)?.height,
    tabActive: r(q('[role="tab"][data-state="active"]'))?.height,
    tabTodosWidth: r(q('[role="tab"][data-state="active"]'))?.width,
    search: r(q('input[placeholder^="Buscar por nome"]'))?.height,
    viewSeg: r(q('[data-testid="view-switcher"]'))?.height,
    colunas: r([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Colunas'))?.height,
    pager: r(q('button[aria-label="Próxima página"]'))?.height,
    cards: [...document.querySelectorAll('[data-testid="contact-card"]')].slice(0,4).map(el=>({h:r(el).height, x:Math.round(r(el).x)})),
    avatar: r(q('[data-testid="contact-card"] [data-testid="contact-avatar"]'))?.width,
    footerBtn: r(q('[data-testid="contact-card"] button[title="Editar"]'))?.height,
    kpiTotal: q('[data-testid="kpi-card"] [data-testid="kpi-value"]')?.textContent,
    tabTodosBadge: q('[role="tab"][data-state="active"] [data-testid="tab-count"]')?.textContent,
    fontInter: document.fonts.check('16px Inter'),
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
  };
});
```
Adicione os `data-testid` indicados nos componentes (é permitido; não altera comportamento). Tabela de asserts (alvo ± tol): `sidebar 234±4 · navItemActive 44±2 · title 38±1 · headerBtn 48±2 · crmBtn 48±2 · kpiCards[*] 108±6 · kpiTile 60±2 · tabBar 52±4 · tabActive 40±2 · tabTodosWidth 152±12 · search 44±2 · viewSeg 44±2 · colunas 44±2 · pager 36±2 · cards[*].h ≥164 · 4 x distintos · avatar 64±2 · footerBtn 36±2 · kpiTotal === tabTodosBadge · fontInter true · scrollW ≤ innerW`. Reduced-motion: `await ctx.emulateMedia({ reducedMotion: 'reduce' })` e checar `getComputedStyle(el).transitionDuration === '0s'` nos cards e pills.

### E.3 `colors.mjs` — amostras de cor (mediana 9×9) vs. alvo (ΔE76)
Pontos (x,y no screenshot 1672×941) e alvo hex: `page (900,425) #08121f` · `card (450,645) #0d1725` · `sidebar (100,300) #0c1625` · `input (300,356) #0a1423` · `primary (1235,356) #1470ff` (pad esquerdo do "Cards") · `success (1500,86) #00d464` · `crm (1180,86) #042159` · `tileBlue (316,181) #01307b` · `tileGreen (661,181) #054236` · `tilePurple (996,181) #252165` · `tileYellow (1346,181) #3b3518` · `badgeCliente (372,485) #042255` · `tabActive (285,290) #022a6a`. Se um ponto cair em texto, mova ±6px para região plana e registre. Tolerância: fundos ΔE ≤ 6, demais ≤ 8. Use `pngjs` para ler pixels; ΔE76 em Lab (implementação simples de 20 linhas — sem lib nova).

### E.4 `compare.mjs` — composite e heatmap (opcional: exige `/workspace/qa/ref.png`)
Com `pngjs` + `pixelmatch`: gerar `NN-compare.png` (referência à esquerda, screenshot à direita, 3344×941) e `NN-heatmap.png` (`pixelmatch(ref, shot, diff, 1672, 941, { threshold: 0.18, includeAA: false })`). Calcular `mismatchPct` por região: `header y0–120`, `kpi 130–250`, `tabs 260–320`, `toolbar 330–430`, `cards 435–941`. Registrar os 5 números.

### E.5 `func.mjs` — QA funcional (16 checks)
Sequência da etapa 97, cada passo com `expect`-like manual (`if (!cond) fails.push('…')`), `page.on('console')` acumulando erros; ao final imprime JSON `{ ok: [...], fail: [...], consoleErrors: [...] }`. Copiar o JSON para o ledger.

## APÊNDICE F — Template do ledger `docs/design/REDESIGN_CONTATOS_STATUS.md`
```md
# Redesign Contatos — Navy Premium — STATUS
Branch: redesign/contatos-navy-v2 · Base: <sha> · Preview: <url>
Repo path (container): <path> · Playwright: ok|bloqueado · QA user: ok

## CP0 Ambiente        [ ] sha= · before=out/00-before.png · gates baseline: typecheck=0 lint-ratchet=ok tc-ratchet=ok implicit=ok vitest=ok
## CP1 Paleta/Fonte    [ ] sha= · shot=01-after.png · colors: page=ΔE_ card=ΔE_ sidebar=ΔE_ input=ΔE_ primary=ΔE_ success=ΔE_ · fontInter=true
## CP2 Shell           [ ] sha= · shot=02-after.png · sidebar=_ navItem=_ logo=_ · dashboard/inbox ok
## CP3 Header          [ ] sha= · shot=03-after.png · headerBtn=_ crmBtn=_ title=_ topSearch=_
## CP4 KPIs            [ ] sha= · shot=04-after.png · kpi=[_,_,_,_] tile=_ · total==todos: _ · lid_legacy filtro: sim|não (motivo)
## CP5 Tabs            [ ] sha= · shot=05-after.png · tabBar=_ tabActive=_ todosW=_
## CP6 Toolbar         [ ] sha= · shot=06-after.png · search=_ sort=_ filtros=_ presets=_ seg=_ colunas=_ · uma linha: sim
## CP7 Resultados      [ ] sha= · shot=07-after.png · pager=_
## CP8 Cards           [ ] sha= · shot=08-after.png · compare=08-compare.png · card=[_,_,_,_] avatar=_ footerBtn=_ colunas=4 gap=_ · badge=ΔE_
## CP9 Secundárias     [ ] sha= · shots=09-list/table/detail.png
## CP10 Motion         [ ] sha= · reduced-motion: durations=0 · bundle Δ=_ KB gz
## CP11 Fidelidade     [ ] final=11-final.png · geometria: N/N ok · cores: N/N ok · mismatch%: header=_ kpi=_ tabs=_ toolbar=_ cards=_ · light ok · mobile ok
## CP12 Entrega        [ ] PR=<url> · CI=verde · merge=<sha> · prod=12-prod.png · colors prod ok

## Divergências plano × código (o que o plano dizia vs. o que existia)
-
## Iterações do loop visual (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Fonte Inter ≠ fonte da referência (larguras ±3%)
- Fotos: avatar_url real ou iniciais (referência usa rostos gerados)
- Séries e deltas: valores reais (referência tem números ilustrativos)
-
```

---

## COMANDO DE DISPARO (para Joaquim, via Portainer → container `claude-code`)
```sh
cd /workspace/repos/<REPO_ZAPP_WEB_V2> && git pull && \
claude -p 'Leia docs/design/PLANO_REDESIGN_CONTATOS_NAVY_100_ETAPAS.md por completo e execute-o do início ao fim, fase por fase, fechando cada checkpoint SOMENTE com a evidência exigida escrita em docs/design/REDESIGN_CONTATOS_STATUS.md. Não pule fases, não reordene, não afirme conclusão sem os arquivos de evidência. Se um gate falhar 3 vezes, registre o resíduo e siga. Ao final, abra o PR e verifique o deploy de produção conforme a etapa 100.' --model sonnet
```
