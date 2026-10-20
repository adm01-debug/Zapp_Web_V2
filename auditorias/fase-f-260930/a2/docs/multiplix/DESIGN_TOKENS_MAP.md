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
