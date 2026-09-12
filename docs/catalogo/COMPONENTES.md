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
| `handleImageError`, `ProductImage` | E04 | fallback de imagem em cascata (substituído por `ProductThumb` na E15) |
| `ProductBadge` + `resolveProductBadge` | E12 | 5 estados, prioridade esgotado > mais vendido > novidade > destaque > em estoque |
| `ColorChips` + `ColorSwatch` | E13 | chips de cor no card (+"+N"); bolinha com hex ou chip de texto (sem hex) |
