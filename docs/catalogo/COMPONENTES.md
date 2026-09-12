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
| `ColorChips` + `ColorSwatch` | E13 | chips de cor no card (+"+N"); bolinha com hex ou chip de texto (sem hex) |
| `PriceTag` | E14 | preço + sugerido riscado (só se diferente) |
| `StockPill` | E14 | "N em estoque" (verde) / "Esgotado" (vermelho, qty<=0 ou flag) |
| `LowStockPill` | E14 | "N un." em âmbar, só 1..threshold (padrão 10) |
