# Catálogo — primitivos e classes (Fase 1)

Documentação viva dos primitivos de `catalogShared.tsx` e das classes `.catalog-*` de
`src/styles/components.css`. Preenchido conforme cada etapa da Fase 1 entrega o primitivo.

## Classes `.catalog-*` (E11)

Nenhum token novo — todas usam `hsl(var(--…))` das variáveis carvão já existentes em
`src/styles/tokens.css:323+`.

| Classe | Uso | Tokens |
|---|---|---|
| `.catalog-card` (+`:hover`) | card de produto na grade | `--card`, `--border`, `--primary`, `--glow-primary-sm` |
| `.catalog-media` | área da foto do produto | `#fff` fixo (produto real tem fundo branco) |
| `.catalog-badge` + `--instock/--bestseller/--new/--featured/--out` | badge de status (canto do card) | `--success`, `--primary`, violet-500 fixo, `--warning`, `--destructive` |
| `.catalog-chip` | chip de cor no card (texto) | `--muted`, `--border`, `--foreground` |
| `.catalog-category-chip` (+`--active`) | linha de chips de categoria | `--card`/`--primary`, `--border` |
| `.catalog-price` | preço em destaque | `--primary` |
| `.catalog-rail` | largura fixa do rail direito (300px / 320px ≥1536) | — |
| `.catalog-gallery-thumb` (+`--active`) | miniatura da galeria no modal de detalhes | `--primary` |
| `.catalog-phone` | moldura do preview de WhatsApp (Enviar Produto) | `--card-elevated`, `--border` |

## Primitivos de `catalogShared.tsx`

| Primitivo | Entregue em | Descrição |
|---|---|---|
| `formatPrice`, `formatStock` | E04 | `Intl.NumberFormat` BRL; "N un." |
| `handleImageError` | E04 | onError da miniatura de variante no detalhe (`ProductImage` foi removido na E15, substituído por `ProductThumb`) |
| `ProductBadge` + `resolveProductBadge` | E12 | 5 estados, prioridade esgotado > mais vendido > novidade > destaque > em estoque |
| `ProductThumb` | E15 | skeleton, srcSet real do Cloudflare Images (5 larguras: 150/300/400/600/1200), fallback em cascata src→fallbackSrc→ícone |
| `FavoriteButton` | E16 | coração com aria-pressed; sem persistência até a E27 |
| `CatalogKpiStrip` | E17 | 6 KPIs (compact), só renderiza os campos numéricos presentes em `stats`; loading→skeleton; clique opcional |
| `CategoryChips` | E18 | linha "Todos · … · Mais ▾" ordenada por products_count, "Mais" em DropdownMenu |
| `CatalogFilterBar` | E18 | compõe `FilterBarV2` (Talk X) via `rightSlot` — sem novas props no componente compartilhado |
| `MetaTile` | E19 | tile de metadado (Qtd. mínima/Prazo/Origem), grade de 3 colunas |
| `SectionCard` | E19 | card interno com título (Descrição, Ficha técnica) |
| `ColorChips` + `ColorSwatch` | E13 | chips de cor no card (+"+N"); bolinha com hex ou chip de texto (sem hex) |
| `PriceTag` | E14 | preço + sugerido riscado (só se diferente) |
| `StockPill` | E14 | "N em estoque" (verde) / "Esgotado" (vermelho, qty<=0 ou flag) |
| `LowStockPill` | E14 | "N un." em âmbar, só 1..threshold (padrão 10) |

## Regras de motion, densidade e responsivo (E20)

Fixadas aqui porque as telas reais (F3–F9) ainda não existem — servem de contrato para quando
forem construídas, e para os testes de a11y/perf (E93/E94) cobrarem exatamente isto.

**Motion**
- Stagger de entrada dos cards: `delay = Math.min(index, 12) * 0.02` (confirmado igual ao
  `DashboardCard.tsx:40`, `duration: 0.15`). `AnimatePresence` com `mode="popLayout"` na grade.
- Hover do card: `translateY(-2px)` + `--glow-primary-sm` (já em `.catalog-card:hover`, E11).
  **Nunca** `scale` no card — o `object-contain` da foto gera jitter perceptível ao escalar o
  container inteiro.
- Todo componente com animação usa `useReducedMotion` (padrão já seguido por `FavoriteButton`,
  E16) — anima só se `!prefersReducedMotion`.

**Breakpoints da grade** (mobile-first, `grid-cols-*` do Tailwind)
- `<640px` (sm): 2 colunas, sem rail
- `640–1024px` (md/lg): 3–4 colunas, sem rail
- `1280–1536px` (xl): 4 colunas + rail 300px (`.catalog-rail`, E11)
- `≥1536px` (2xl): 5 colunas + rail 320px
- Rail desaparece `<1280px` e vira `Accordion` acima da grade (E58, ainda não construído)

**Modais**
- Detalhe do produto: `max-w-5xl` · Enviar Produto: `max-w-6xl` · Selecionar contato: `max-w-4xl`
- Em mobile (`<md`), os três viram `Drawer` (vaul) full-height em vez de `Dialog` centralizado

**Tipografia do card**
- Título: 13px semibold, 2 linhas (`line-clamp-2`)
- Marca/fornecedor: 11px `text-foreground-secondary`
- Preço: 16px (`.catalog-price`, E11 — já usado por `PriceTag` tamanho `md`)
