CONTINUACAO — Design System Promo Gifts no ZAPP WEB V2 (Fases 2-12)

Worktree: /workspace/repos/Zapp_Web_V2-promogifts | Branch: design/promo-gifts-system | Fase 1 SHA: 9afd393b

LEIA PRIMEIRO: docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md

DIVERGENCIAS DO PLANO (ja confirmadas no codigo real):

1. AppShell.main usa overflow-hidden; scroll eh dentro do ViewContainer (overflow-y-auto).
   AppHeader deve ser sticky dentro de uma nova coluna flex, nao fixed.
   Estrutura alvo:
     <div class="flex h-screen overflow-hidden">
       <Sidebar/>
       <div class="flex flex-1 flex-col min-w-0 overflow-hidden">
         <AppHeader class="sticky top-0 z-40 shrink-0 h-14"/>
         <BreadcrumbBar class="sticky top-14 z-30 shrink-0"/>
         <main class="flex-1 min-h-0 overflow-hidden">
           <ViewRouter/> (ViewContainer faz overflow-y-auto interno)
         </main>
       </div>
       <VoiceCopilotFAB/>
     </div>

2. AppShell ja tem props: canGoBack, goBack, breadcrumbTrail — usar no Teletransporte diretamente.
3. Mic: omitir do header (VoiceCopilotFAB ja existe).
4. presets.ts tinha override post-buildPreset forcando 213 — JA CORRIGIDO para 221.
5. SidebarNavItem atual: rounded-[10px] h-11 pill navy. Alvo: rounded-xl py-2 barra before: 3px.
6. SidebarNavGroup atual: sem colapsavel. Reescrever com Collapsible (Radix ja no projeto).
7. Antes da Fase 8 (Contatos): cherry-pick de fix/contatos-fidelidade-v2:
   git cherry-pick 011b2660 c9d155fa 2c14ea03 b911b810 652e2f1b f875a5c6 07efea8b 430c0244 4f40fa41 a3e6d9eb d12a75eb 50cdf07d

EXECUTE EM ORDEM:

FASE 2: AppHeader sticky + modificar AppShell.tsx para coluna flex
  - Criar: AppHeader.tsx, HeaderSectionAnchor.tsx, GlobalSearchTrigger.tsx, HeaderUserPill.tsx, RoleBadge.tsx
  - AppHeader: bg-sidebar/60 backdrop-blur-xl border-b border-border/10; h-14
  - GlobalSearchTrigger: pill rounded-2xl border-border/40 bg-muted/40 + kbd ⌘K
  - HeaderUserPill: avatar 32 + nome + dot online + signOut dropdown (reutiliza AgentProfilePopover content)
  - HeaderSectionAnchor: eyebrow "SECAO ATUAL" + label da view (NavigationService)

FASE 3: BreadcrumbBar + Teletransporte + LayoutContext
  - BreadcrumbBar.tsx: sticky top-14 z-30; botao Teletransporte (Zap sky-400, chama goBack)
  - LayoutContext.tsx: hasBreadcrumbBar boolean
  - PageHeader: com hasBreadcrumbBar nao renderiza breadcrumb proprio

FASE 4: SidebarNavItem (reescrever), SidebarNavGroup (reescrever com Collapsible), Sidebar.tsx (remover busca e rodape)
  - SidebarNavItem: barra before: 3px quando ativo, hover:translate-x-1, rounded-xl
  - SidebarNavGroup: Collapsible, estado em localStorage['zapp-sidebar-groups']
  - Sidebar: remover campo de busca; remover AgentProfilePopover do rodape

FASE 5: NavItem.shortcut, kbd na sidebar, useNavShortcuts
  Alt+C Chat | Alt+M Teams | Alt+L Email | Alt+O Contatos | Alt+R Dashboard | Alt+P Pipeline | Alt+N Campanhas | Alt+G Config

FASE 6: StarBackground (60 pts, lazy, so dark), montar no AppShell

FASE 7: ui/button (active:scale, variante success), ui/input (h-10 rounded-xl), ui/badge (rounded-full), ui/tabs (active=bg-primary)

FASE 8: cherry-pick + ContactCard (card-lift card-glow), toolbar h-40, ContactKpiCard h-96, deletar ContactsTopActions.tsx

FASE 9: Dashboard (harmonizacao de tokens), Inbox (tokens ja ok), views secundarias (smoke test)

FASES 10-12: motion fade 300ms, QA scripts /workspace/qa/pg-*.mjs, PR para main

REGRAS: apenas worktree promogifts | push --no-verify | commit por fase design(pg): fase N | zero backend | diff minimo
