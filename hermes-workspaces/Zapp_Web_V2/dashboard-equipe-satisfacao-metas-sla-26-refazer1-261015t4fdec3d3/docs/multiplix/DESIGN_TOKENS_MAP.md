# Multiplix — De-para protótipo → tokens reais (E010)

Fonte: `docs/design/ZAPP_DARKBLUE_PREMIUM_TOKENS.css` (já existe no repo — é literalmente o
"DarkBlue operacional" pedido pela especificação) + `src/styles/tokens.css` +
`docs/design-system/glows.md`.

| Item do protótipo | Token real |
|---|---|
| `--bg` | `.dark { --zapp-bg-0 / --zapp-bg-1 / --zapp-bg-2 }` |
| `--surface` | `--zapp-surface-1 / -2 / -3`, `--zapp-elevated` |
| `--line` | `--zapp-border` / `--zapp-border-hover` / `--zapp-divider` |
| `--blue` | `--zapp-blue` / `-hover` / `-active` / `-soft` / `-border` |
| `--green` | `--zapp-success` (`#21d19f`) |
| `--amber` | `--zapp-warning` (`#f6b73c`) |
| `--red` | `--zapp-danger` (`#ff5d6c`) |
| glow/aura | `docs/design-system/glows.md` — classes `shadow-glow-*` / `shadow-elev-*`. Nunca
  `shadow-[0_0_Xpx_hsl(...)]` hardcoded. |
| Raios | `--zapp-radius-xs` (4px) → `--zapp-radius-2xl` (16px) já cobrem chip→modal |
| Componentes | `src/components/ui/` (shadcn) — zero criação nova (regra E120) |
| Entrada do módulo | `src/pages/lazyViews.ts`: `export const XView = lazyWithRetry(() =>
  import('@/components/x/XView')...)`. `TalkXView` já está cadastrado lá — usar como referência
  direta de import. |

## Correção em relação ao plano/especificação

O plano assumiu "Outfit (títulos) / Plus Jakarta Sans (corpo)". Os tokens reais dizem o
**inverso**: `--zapp-font-display: 'Plus Jakarta Sans', 'Outfit', ...` (display/títulos) e
`--zapp-font-sans: 'Outfit', ...` (corpo). Confirmar visualmente contra o protótipo HTML antes de
aplicar em E119 — não usar a suposição do plano.

## Receita de módulo completa (F94) — `lazyViews` + rota + nav + permissão + flag

São 4 passos, nesta ordem, para um módulo virar item de menu acessível. Os valores abaixo são os do
**Multiplix**, conferidos em `src/pages/lazyViews.ts`, `src/pages/ViewRouter.tsx` e
`src/services/navigation.service.ts` na ponta de dia de 2026-10-08.

1. **View lazy** — `src/pages/lazyViews.ts`:

   ```ts
   export const MultiplixView = lazyWithRetry(() => import('@/components/multiplix/MultiplixView'));
   ```

2. **Rota** — `src/pages/ViewRouter.tsx`: registrar `'multiplix': Views.MultiplixView` no mapa de views.
   Sem essa linha o `?view=multiplix` não renderiza nada.

3. **Navegação + permissão** — `src/services/navigation.service.ts`: entrada da nav primária
   `{ id: 'multiplix', icon: Send, label: 'Multiplix', permission: 'multiplix.dispatch.create' }`.
   O gate é a permissão **nomeada** (não o papel): `NavigationService.canAccess` nega por padrão e
   `filterNavItems` esconde o item de quem não tem a permissão. O mesmo par (id, permissão) vale para o
   menu e para o acesso direto por `?view=multiplix`.

4. **Flag (kill switch)** — o mecanismo já existe (`src/hooks/system/useFeatureFlag.ts`:
   `useFeatureFlag(key, fallback)` sobre a tabela `feature_flags`). **Hoje o Multiplix não tem chave de
   flag** — o único gate é a permissão nomeada do passo 3. Criar/reusar um kill switch exige uma linha em
   `feature_flags`, que é trilha de banco (DDL/seed) e não entra num plano de front.

Regra de ouro: **nenhum componente de UI novo** — o módulo usa `src/components/ui/` e os utilitários de
`@/components/talkx/talkxShared` (`ModuleHeader`, `StatusPill`, `fmtInt`).
