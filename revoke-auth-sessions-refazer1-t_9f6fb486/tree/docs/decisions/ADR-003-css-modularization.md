# ADR-003: Modularização do Design System CSS

## Status: Aceito
## Data: 2026-04-13

## Contexto
O arquivo `src/index.css` cresceu para ~1750 linhas, misturando design tokens, estilos base, componentes, animações e acessibilidade em um único arquivo monolítico. Isso dificultava a manutenção, a localização de estilos específicos e o onboarding de novos desenvolvedores.

## Decisão
Dividimos o `index.css` em 7 módulos CSS focados, importados via `@import` no arquivo raiz:

| Módulo | Responsabilidade |
|--------|-----------------|
| `styles/tokens.css` | CSS variables (light/dark mode) — cores, sombras, gradientes, tipografia |
| `styles/base.css` | Resets, tipografia base, scrollbar, focus states |
| `styles/utilities.css` | Classes utilitárias (gradient-text, glow, scrollbar-thin) |
| `styles/components.css` | Estilos de componentes (cards, hover, chat bubbles, gamification) |
| `styles/animations.css` | Todas as `@keyframes` |
| `styles/sidebar.css` | Navegação, sidebar, reveal animations |
| `styles/accessibility.css` | High contrast, reduced motion, large text, density modes |

## Consequências
- ✅ Cada módulo tem < 300 linhas — fácil de navegar e manter
- ✅ Separação clara de responsabilidades (tokens vs componentes vs animações)
- ✅ Facilita code review — mudanças visuais isoladas por domínio
- ✅ Build Vite processa `@import` nativamente — zero overhead
- ❌ Imports CSS devem ser mantidos em ordem correta no `index.css`
