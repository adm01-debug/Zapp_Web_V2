# Design System Promo Gifts → ZAPP WEB V2 — STATUS
Branch: design/promo-gifts-system · Base: 3bf9a4e1 · Preview: (aguardando push)
Worktree: /workspace/repos/Zapp_Web_V2-promogifts
Sessão dashboard navy: ATIVA (PID 29447) — não encerrada; plano de rebase na Fase 9
Playwright: ok (qa existente) · QA user: ZAPP_QA_EMAIL em /workspace/.secrets/zapp-v2.env · E.4: pulado (sem PNG)

## CP0 Ambiente      [x] sha=3bf9a4e1 · worktree criado · node_modules symlinked de main checkout
  baseline: lint-ratchet=OK (1201 dívidas, 0 novas) · implicit-any=0 · typecheck=timeout (pré-existente no repo)

## CP1 Paleta/Tipo   [x] sha=9afd393b · tokens navy→charcoal (36 subs .dark), PJS/Outfit, radius 14, sidebar 256px, skin v5 · ΔE: bg≈0 (rgb(14,14,16)=#0e0e10) · primary 221 83% 53% ✓ · light=sem mudança sha= · shot=pg-01-after.png · ΔE page=_ card=_ sidebar=_ · fonts PJS+Outfit=_ · light ok=_ · skin v5=_

## CP2 Header        [x] sha=58d3714f · AppHeader.tsx, HeaderSectionAnchor.tsx, GlobalSearchTrigger.tsx, HeaderUserPill.tsx, RoleBadge.tsx · AppShell reestruturado em coluna flex (Sidebar | [AppHeader sticky + main]) · AgentProfilePopover refatorado: ProfileMenuContent extraído e reusado no HeaderUserPill · tsc 0 erros · eslint limpo · vite build ok

## CP3 Breadcrumb    [x] sha=ed0428e1 · BreadcrumbBar.tsx (sticky top-14 z-30, botão Teletransporte Zap sky-400 + trilha breadcrumbTrail) · LayoutContext.tsx (hasBreadcrumbBar) · PageHeader não renderiza breadcrumb próprio quando hasBreadcrumbBar=true · tsc/eslint/build ok

## CP4 Sidebar       [x] sha=e6ec3e2f · SidebarNavItem: barra before:3px + hover:translate-x-1 + rounded-xl (expandido); collapsed inalterado · SidebarNavGroup: mantido padrão AnimatePresence existente (já era colapsável) + persistência localStorage['zapp-sidebar-groups'] por label — NÃO trocado para Radix Collapsible (divergência: ledger dizia "sem colapsável" mas o componente já animava abrir/fechar; trocar o motor por Radix seria puro churn sem ganho) · Sidebar: campo de busca removido (GlobalSearchTrigger no header cobre) + AgentProfilePopover removido do rodapé (HeaderUserPill cobre) · AgentProfilePopover.tsx deletado, conteúdo do menu virou ProfileMenuContent.tsx (reusado por HeaderUserPill) · lint: 6 erros pré-existentes confirmados via git stash (0 novos) · tsc/build ok

## CP5 Atalhos       [x] sha=83483895 · NavigationService.getPrimaryNav(): shortcut Alt+C/M/L/O/R/P/N/G nos 8 itens · useNavShortcuts.ts (hook standalone, usa e.code p/ evitar dead-keys do Option no macOS, ignora inputs/textarea/contentEditable) · wired em AppShell via handleViewChange · SidebarNavItem: kbd visível on-hover no modo expandido (SHORTCUT_MAP antigo ⌘1/⌘2 removido, superseded) · divergência: não reusei useGlobalKeyboardShortcuts/useCustomShortcuts (sistema de rotas legado com navigate('/') + toast, não integrado a setCurrentView) — hook novo dedicado é mais direto e sem side effects · tsc/eslint/build ok

## CP6 Fundo         [x] sha=736b675e · StarBackground.tsx (60 pontos, posição/tamanho/delay via Math.random() memoizado, animate-pulse + motion-reduce:animate-none, pointer-events-none, aria-hidden) · lazy(() => import(...)) + Suspense fallback=null · montado dentro de <main>, condicional isDark (useTheme) · limpeza: classe .page-glow morta removida do <main> e regra .dark .page-glow morta removida de utilities.css (referenciava --page-glow, já removido na Fase 1 — StarBackground assume o papel de ambientação dark) · tsc/eslint/build ok

## CP7 Primitivos    [x] sha=49a0310a · button.tsx: +active:scale-[0.97] na base (variante success já existia) · input.tsx: já era h-10 rounded-xl, sem mudança · badge.tsx: já era rounded-full, sem mudança · tabs.tsx: data-[state=active] bg-background/text-foreground → bg-primary/text-primary-foreground (já era o padrão manualmente overridden em Auth.tsx/ConversationList.tsx/VirtualizedConversationList.tsx — confirma que o novo default é o comportamento pretendido) · fix necessário: OmnichannelInbox.tsx e GmailInboxView.tsx usam tabs estilo "underline" (border-b-2, sem bg próprio) — sem o data-[state=active]:bg-transparent explícito herdariam o novo bg-primary sólido; corrigido nos dois · demais consumers (DashboardTabs, SLARulesManager, ContactTypeTabs, AIToolsPopover) já tinham bg-* próprio, sem conflito · tsc/eslint/build ok

## CP8 Contatos      [x] sha=8998b93b · ContactCard +card-lift card-glow, sem hover manual · ContactKpiCard h-[96px] rounded-2xl +card-glow · kpi-tile→alpha/0.13 (charcoal tint) · toolbar h-11→h-10 · ContactsTopActions deletado · cherry-picks pulados (de0b8def squash já tem tudo)

## CP9 Views         [x] sha=8998b93b · GreetingBanner bg-[hsl(224_85%_29%)]→bg-primary/15 (único hardcoded navy restante) · Inbox/chat tokens OK (já em fase 1) · DashboardTopBar sem hardcoded

## CP10 Motion/Perf  [x] sha=8998b93b · animations.css: ::view-transition-old/new 300ms fade + reduced-motion 0.001ms · SidebarNavGroup: effectiveOpen pattern (isOpen||hasActiveItem) sem useEffect/useRef · build 15s exit 0

## CP11 Fidelidade   [x] sha=abd1b838 · QA Playwright local 1440×900 — 10/10 gates OK:
  bg=#0e0e10 ✓ primary=221 83% 53% ✓ background=240 6% 6% ✓
  kpi=[96,96,96,96] ✓ cards=174px ✓ hasDark=true ✓
  fontPJS=true ✓ noScroll=true ✓ card-lift=true ✓ header=56px ✓
  consoleErrors: 2 pré-existentes (<button> nested no ContactResultsSummary — não introduzido)

## CP12 Entrega      [ ] sha= · PR=pendente · CI=pendente · merge=pendente

## Divergências plano × código (verificadas na simulação)
- AppShell.main usa overflow-hidden; scroll real está em ViewContainer (overflow-y-auto).
  Decisão: AppHeader será sticky dentro da coluna flex, não fixed com left:sidebar-w.
- breadcrumbTrail/canGoBack/goBack já existem como props no AppShell — Teletransporte os consome diretamente.
- Mic omitido do header (VoiceCopilotFAB já existe; duplicar requer prop drilling desnecessário).
- presets.ts tem bloco de override pós-buildPreset forçando navy 213 — corrigido para 221.
- gradient-divider não estava no presets.ts dark block (omitido) — ok, tokens.css cobre.
- fix/contatos-fidelidade-v2: 14 commits de fixes de contatos a integrar via cherry-pick antes da Fase 8.

## Fase 1 — Mudanças executadas (07/09/2026)
**tokens.css:**
- :root: --font-sans PJS, --font-display Outfit, --radius 0.875rem, --sidebar-w 256px, --sidebar-w-collapsed 64px
- :root: +17 tokens novos (--surface, --border-strong, --divider, --primary-hover/active, motion, --shadow-glow-focus, kpi-tiles charcoal)
- :root: --page-glow removido
- .dark: 36/36 substituições (background 216→240, primary 213→221, muted, border, sidebar, chat, gradients, shadows, glass, elevated)
**presets.ts:**
- buildPreset dark block: 25/27 substituições de neutros (gradient-surface/divider via regex separada)
- Bloco de override corporate: 8 propriedades 213→221 (primary, ring, sidebar-primary/ring, chat-bubble-sent, status-open, gradient-primary)
- glass-bg: 215 50% 10% / 1 → 240 6% 8% / 0.85
- STORAGE_VERSION: 4 → 5
- Resultado: zero ocorrências de 213 100% 54% no arquivo
**index.html:**
- Google Fonts: PJS 400-700 (corpo) + Outfit 500-800 (display)
- boot script: c.v === 4 → c.v === 5 (invalida skins navy)
- fallback font: Outfit → Plus Jakarta Sans
**src/index.css:** --font-sans Inter → Plus Jakarta Sans
**src/styles/base.css:** body: font-weight 500, letter-spacing -0.015em adicionados
**src/styles/utilities.css:** .card-lift, .card-glow, .dark .card-lift:hover + reduced-motion

## Pendências / resíduos (honestos)
- KPI tiles com alpha direto (221 83% 53%) em vez de mistura navy (#01307b): leve diferença visual; o alpha sobre charcoal dá resultado próximo.
- Dashboard navy ainda em main: tokens --dash-tile-* preservados (não tocados).
- Teletransporte: usa breadcrumbTrail/goBack de AppShell (view-based), não history.back() (URL-based).
- Contatos: cherry-pick de fix/contatos-fidelidade-v2 necessário antes da Fase 8.
