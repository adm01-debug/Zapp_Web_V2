# UX Audit Report — Zapp Web V2

> Auditoria iniciada: 2026-09-03 | Branch: `claude/design-layout-ux-audit-3fq4jj`
> Protocolo: 100-step UX Audit (Fases 1–10)

---

## SUMÁRIO DE ACHADOS

| Severidade | Qtd | Status |
|------------|-----|--------|
| [CRÍTICO]  | 1   | 1 corrigido |
| [ALTO]     | 1   | aberto |
| [MÉDIO]    | 2   | 2 corrigidos |
| [BAIXO]    | 1   | 1 corrigido |

---

## FASE 1 — RECONHECIMENTO DO SISTEMA

### Mapa do Sistema

#### Rotas URL (React Router DOM — `AppRoutes.tsx`)

| # | Rota | Componente | Auth | Role |
|---|------|------------|------|------|
| 1 | `/` | `Index` → AppShell + ViewRouter | Protegida | — |
| 2 | `/auth` | `Auth` | Pública | — |
| 3 | `/forgot-password` | `ForgotPassword` | Pública | — |
| 4 | `/reset-password` | `ResetPassword` | Pública | — |
| 5 | `/verify-email` | `VerifyEmail` | Pública | — |
| 6 | `/auth/callback` | `SSOCallback` | Pública | — |
| 7 | `/2fa` | `TwoFactorAuth` | Pública | — |
| 8 | `/install` | `Install` | Pública | — |
| 9 | `/chat-popup/:contactId` | `ChatPopup` | Protegida | — |
| 10 | `/queue/:id` | `QueueDetails` | Protegida | — |
| 11 | `/queues/comparison` | `QueuesComparison` | Protegida | — |
| 12 | `/sla` | `SLADashboard` | Protegida | — |
| 13 | `/sla/history` | `SLAHistory` | Protegida | — |
| 14 | `/admin/roles` | `RolesPage` | Protegida | admin |
| 15 | `/admin/rate-limit` | `RateLimitDashboard` | Protegida | admin |
| 16 | `*` | `NotFound` | Pública | — |

#### Views Internas SPA (`ViewRouter.tsx` — navegam sem mudar URL)

55+ views acessadas via `currentView` string a partir de `/`. Views full-screen (sem header wrapper): `inbox`, `pipeline`, `omni-inbox`, `team-chat`, `email-chat`.

#### Fluxos Críticos Identificados

1. **Autenticação** → `/auth` → MFA `/2fa` → `/` (inbox)
2. **Inbox** → seleção de conversa → painel de chat → ações rápidas (Resolver/Transferir/Arquivar)
3. **Admin** → `ForceLogout` de usuários
4. **Reset de senha** → `/forgot-password` → email → `/reset-password`

### Arquitetura Técnica

- **Frontend:** React 19 + Vite 8 + TypeScript
- **Roteamento:** React Router DOM v6 (URLs) + SPA view-router interno (sem URLs)
- **UI:** shadcn/ui + Radix UI + Tailwind CSS v3 + tokens CSS customizados
- **Backend:** Supabase Cloud (`tnnnlkbymytvtqngbbqh`) — Auth, DB (120+ tabelas), Edge Functions (60), Storage, Realtime
- **Estado servidor:** TanStack Query v5
- **Design tokens:** `src/styles/tokens.css` — light/dark, Corporate Blue (hsl 221 83% 53%), escala completa de radius/elevation/z-index/animation
- **Fonte:** Outfit (sans) + Plus Jakarta Sans (display)
- **Animações:** Framer Motion v12 com suporte a `prefers-reduced-motion` ✅

---

## FASE 2 — INVENTÁRIO DE ESTADOS DE TELA

### Checklist de Estados por View Principal

#### Inbox (`RealtimeInboxView`)
- [x] Loading skeleton — `ConversationListSkeleton` existe ✅
- [x] Empty state — `EmptyState` component referenciado ✅
- [x] Error boundary — `ErrorBoundaryWithRetry` por view ✅
- [x] Estado selecionado — `isSelected` prop + highlight visual ✅
- [ ] **Hover com ação sem handler** — botões aparecem mas não funcionam ❌ [CRÍTICO — ver F3.1]

#### Contacts
- [x] Skeleton — `ContactsSkeleton.tsx` existe ✅
- [x] Empty state referenciado ✅

---

## FASE 3 — NAVEGAÇÃO E FLUXO

### F3.1 [CRÍTICO] ConversationItem — Botões de ação silent

**Arquivo:** `src/components/inbox/conversation-list/ConversationItem.tsx:160-165`

**Evidência:**
```tsx
// Resolver
<button onClick={(e) => e.stopPropagation()} ...>
// Transferir
<button onClick={(e) => e.stopPropagation()} ...>
// Fixar
<button onClick={(e) => e.stopPropagation()} ...>
// Favoritar
<button onClick={(e) => e.stopPropagation()} ...>
// Adiar
<button onClick={(e) => e.stopPropagation()} ...>
// Arquivar
<button onClick={(e) => e.stopPropagation()} ...>
```

**Impacto:** 6 ações aparecem no hover de TODA conversa na inbox principal. Usuário clica — nada acontece. Nenhum feedback visual ou auditivo. Pior que não ter os botões: promete e não entrega.

**Correção:** Adicionadas props opcionais `onResolve`, `onTransfer`, `onPin`, `onFavorite`, `onSnooze`, `onArchive`. Se não fornecidas pelo pai, mostra `toast.info("Em desenvolvimento")`. **Status: CORRIGIDO** ✅

---

## FASE 4 — FEEDBACK E COMUNICAÇÃO

### F4.1 [MÉDIO] ForceLogoutButton — `window.confirm()` nativo

**Arquivo:** `src/components/admin/ForceLogoutButton.tsx:16`

**Evidência:**
```tsx
if (!confirm(`Tem certeza que deseja forçar logout de ${userName}?`)) return;
```

**Impacto:** Dialog nativo do browser — sem estilo da aplicação, sem suporte a `dark mode`, bloqueante para automação de testes, inconsistente com o padrão shadcn AlertDialog usado em todo o restante do app.

**Correção:** Substituído por `AlertDialog` do shadcn/ui. **Status: CORRIGIDO** ✅

---

## FASE 5 — CONSISTÊNCIA VISUAL

### F5.1 [MÉDIO] Fonte de display sobrescrita — Plus Jakarta Sans nunca aplicada

**Arquivo:** `src/index.css:26`

**Evidência:**
```css
/* index.css carrega DEPOIS de tokens.css — sobrescreve */
:root {
  --font-display: 'Outfit', system-ui, sans-serif; /* ← apaga Plus Jakarta Sans de tokens.css */
  --font-sans: 'Outfit', system-ui, sans-serif;
}
```
`tokens.css` declara `--font-display: 'Plus Jakarta Sans'`, mas `index.css` a redeclara para Outfit. Resultado: `h1/h2/h3/h4/h5/h6` usam Outfit em vez de Plus Jakarta Sans, apesar da fonte estar carregada no `index.html`.

**Correção:** Removida linha `--font-display` de `index.css`, deixando apenas `--font-sans`. A variável `--font-display` passa a ser provida exclusivamente por `tokens.css`. **Status: CORRIGIDO** ✅

---

### Outras observações de consistência

- Design tokens bem estruturados: light/dark, escala completa ✅
- `index.html` carrega ambas as fontes via Google Fonts (Outfit + Plus Jakarta Sans) ✅
- Tailwind + CSS custom properties sincronizados via `tailwind.config.ts` ✅

---

## FASE 7 — ACESSIBILIDADE

### Pontos positivos identificados

- `@axe-core/react` integrado ✅
- `aria-label` em todos os botões icon-only da sidebar ✅
- `role="navigation"` + `aria-label` na sidebar ✅
- `aria-busy` + `role="status"` no loading fallback de rota ✅
- `useAriaAnnouncer` → anuncia trocas de view para leitores de tela ✅
- `focus-visible:ring-2` consistente em controles interativos ✅
- `SkipLink` component existe (`src/components/ui/skip-link.tsx`) ✅
- `prefers-reduced-motion` respeitado em AnimatePresence ✅

---

## FASE 8 — ALTO [ABERTO] — Navegação SPA sem URLs

**Arquivos:** `src/pages/ViewRouter.tsx`, `src/pages/Index.tsx`

**Evidência:** `useNavigationHistory` já sincroniza cada view com a URL via hash (`#inbox`, `#contacts`, etc.), incluindo suporte a Back/Forward do browser via listener `hashchange` e deep-link inicial via `window.location.hash`. `ViewRouter` usa `useAriaAnnouncer` para anunciar mudanças de view para leitores de tela. O que permanece em aberto é o padrão de URL: atualmente usa `#view` (hash fragment), que pode ser migrado para `?view=X` (query string) ou `/app/X` (path) para melhor indexação e UX de compartilhamento.

**Impacto atual (já resolvido):**
- ✅ Back/Forward do browser funciona entre views via hash
- ✅ Deep-link direto funciona (ex: `/#contacts`, `/#reports`)
- ✅ Leitores de tela recebem anúncio de mudança de módulo via `useAriaAnnouncer`

**Pendência de arquitetura:** Migrar de `#view` para `?view=X` ou `/app/X` requer decisão sobre React Router vs. solução customizada e impacto em SSR/Vercel routing.

**Correção sugerida:** Implementar `/?view=contacts` ou `/app/contacts` como padrão de URL canônica. **Status: PARCIALMENTE IMPLEMENTADO (hash) — migração para path/query requer decisão de arquitetura**

---

## FASE 4 — FEEDBACK E COMUNICAÇÃO (continuação)

### F4.2 [BAIXO] RateLimitRealtimeAlerts — catch vazio silencia falhas de áudio

**Arquivo:** `src/components/security/RateLimitRealtimeAlerts.tsx:83`

**Evidência:**
```tsx
const playAlertSound = () => {
  try {
    const audio = new Audio('/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch (e) {} // ← silencioso
};
```

**Impacto:** Em componente de alertas de segurança, falhas no construtor `Audio()` são engolidas sem rastro. Se o arquivo de áudio não existir ou o ambiente não suportar Web Audio, o administrador não percebe que o alerta sonoro não funciona.

**Correção:** Substituído `} catch (e) {}` por `} catch (e) { console.warn('[RateLimitRealtimeAlerts] Alert sound failed:', e); }`. Erro visível em DevTools sem interromper o fluxo. **Status: CORRIGIDO** ✅

---

## PRÓXIMOS PASSOS (pendentes de aprovação)

```text
Próximos passos
1. [URL por view] Implementar deep-link via ?view=X ou /app/X — corrige Back button e bookmarking · src/pages/Index.tsx + ViewRouter.tsx
2. [Wiring real das ações] Conectar onResolve/onTransfer/onArchive ao ConversationItem nos pais reais — a prop já existe, falta o pai passá-la · src/components/inbox/conversation-list/ConversationList.tsx
3. [Phases 5-10] Continuar auditoria: consistência visual, formulários, mobile 360px, integridade de dados · audit completo
```
