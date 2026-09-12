/* eslint-disable react-refresh/only-export-components */
/**
 * Helpers e primitivos compartilhados do módulo Catálogo.
 * Ponto único para evitar duplicação entre ExternalProductCard,
 * ProductDetailDialog e demais componentes de src/components/catalog/.
 */
import React, { useState } from 'react';
import { Package } from 'lucide-react';

/** R$ 63,78 (pt-BR, BRL). */
export const formatPrice = (price: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

/** "1573 un." — plural simples (o domínio não usa singular/plural PT completo aqui). */
export const formatStock = (qty: number) => `${qty} un.`;

export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
  if (fallback) fallback.style.display = 'flex';
};

// ProductImage removido na E15 — substituído por ProductThumb (skeleton + srcSet real + fallback em cascata).

// ─── ProductBadge (E12) ─────────────────────────────────────────
import { Check, Flame, Sparkles, Star, XCircle } from 'lucide-react';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

export type ProductBadgeKind = 'out' | 'bestseller' | 'new' | 'featured' | 'instock';

const BADGE_CONFIG: Record<ProductBadgeKind, { label: string; Icon: typeof Check }> = {
  out: { label: 'Esgotado', Icon: XCircle },
  bestseller: { label: 'Mais vendido', Icon: Flame },
  new: { label: 'Novidade', Icon: Sparkles },
  featured: { label: 'Destaque', Icon: Star },
  instock: { label: 'Em estoque', Icon: Check },
};

/**
 * Resolve qual badge mostrar, por prioridade: esgotado > mais vendido >
 * novidade > destaque > em estoque. Antes da E21/E48 (flags e expiração
 * completas) os campos vêm `undefined` e o produto cai em instock/out.
 */
export function resolveProductBadge(
  p: Pick<ExternalProduct, 'is_stockout' | 'is_bestseller' | 'is_new' | 'is_featured'>
): ProductBadgeKind {
  if (p.is_stockout) return 'out';
  if (p.is_bestseller) return 'bestseller';
  if (p.is_new) return 'new';
  if (p.is_featured) return 'featured';
  return 'instock';
}

interface ProductBadgeProps {
  kind: ProductBadgeKind;
  size?: 'sm' | 'md';
}

export function ProductBadge({ kind, size = 'md' }: ProductBadgeProps) {
  const { label, Icon } = BADGE_CONFIG[kind];
  return (
    <span
      className={`catalog-badge catalog-badge--${kind}`}
      style={size === 'sm' ? { height: 18, fontSize: 10, padding: '0 0.375rem' } : undefined}
      aria-label={label}
    >
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {label}
    </span>
  );
}

// ─── ColorChips / ColorSwatch (E13) ────────────────────────────
export interface CatalogColorLike {
  color_name?: string | null;
  name?: string | null;
  color_hex?: string | null;
}

interface ColorSwatchProps {
  hex?: string | null;
  name: string;
  size?: number;
}

/** Bolinha de cor com borda; sem hex, mostra só um chip de texto (E64 reusa). */
export function ColorSwatch({ hex, name, size = 16 }: ColorSwatchProps) {
  if (!hex) {
    return <span className="catalog-chip" title={name}>{name}</span>;
  }
  return (
    <span
      className="inline-block rounded-full border"
      style={{ width: size, height: size, backgroundColor: hex, borderColor: 'hsl(var(--border) / 0.6)' }}
      title={name}
      role="img"
      aria-label={`Cor ${name}`}
    />
  );
}

interface ColorChipsProps {
  colors: (string | CatalogColorLike)[];
  max?: number;
}

function colorLabel(c: string | CatalogColorLike): string {
  return typeof c === 'string' ? c : c.color_name || c.name || 'Padrão';
}

/** Chips "BRANCO NATURAL PRETO" do card, com "+N" quando excede `max`. */
export function ColorChips({ colors, max = 3 }: ColorChipsProps) {
  if (!colors || colors.length === 0) return null;
  const visible = colors.slice(0, max);
  const extra = colors.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c, i) => (
        <span key={i} className="catalog-chip" title={colorLabel(c)}>
          {colorLabel(c)}
        </span>
      ))}
      {extra > 0 && <span className="catalog-chip">+{extra}</span>}
    </div>
  );
}

// ─── PriceTag / StockPill / LowStockPill (E14) ─────────────────
interface PriceTagProps {
  value: number;
  suggested?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

const PRICE_SIZE_CLASS: Record<NonNullable<PriceTagProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

/** Preço em destaque (.catalog-price da E11); sugerido riscado ao lado só se diferente. */
export function PriceTag({ value, suggested, size = 'md' }: PriceTagProps) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`catalog-price tabular-nums ${PRICE_SIZE_CLASS[size]}`}>{formatPrice(value)}</span>
      {suggested != null && suggested !== value && (
        <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(suggested)}</span>
      )}
    </span>
  );
}

interface StockPillProps {
  qty: number;
  stockout?: boolean;
}

/** "1573 em estoque" (verde) ou "Esgotado" (vermelho). */
export function StockPill({ qty, stockout }: StockPillProps) {
  if (stockout || qty <= 0) {
    return <span className="catalog-badge catalog-badge--out">Esgotado</span>;
  }
  return <span className="catalog-badge catalog-badge--instock tabular-nums">{qty} em estoque</span>;
}

/** "2 un." em âmbar — só entre 1 e `threshold` (padrão 10, mesmo limiar dos 308 produtos reais). */
export function LowStockPill({ qty, threshold = 10 }: { qty: number; threshold?: number }) {
  if (qty < 1 || qty > threshold) return null;
  return <span className="catalog-badge catalog-badge--featured tabular-nums">{formatStock(qty)}</span>;
}

// ─── ProductThumb (E15) ─────────────────────────────────────────
/**
 * Variantes reais do Cloudflare Images da conta do PromoGifts, confirmadas
 * via CF Images API em 2026-09-12 (todas JPEG): thumbnail 150×150,
 * small 300×300, card 400×400, medium/public 600×600, large 1200×1200.
 */
const CF_IMAGES_HOST = 'imagedelivery.net';
const CF_VARIANT_WIDTHS: Record<string, number> = {
  thumbnail: 150,
  small: 300,
  card: 400,
  medium: 600,
  public: 600,
  large: 1200,
};

function cfImagesSrcSet(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== CF_IMAGES_HOST) return null;
  const parts = parsed.pathname.split('/').filter(Boolean); // [accountHash, imageId, variant]
  if (parts.length < 3) return null;
  const base = `${parsed.origin}/${parts.slice(0, -1).join('/')}`;
  return Object.entries(CF_VARIANT_WIDTHS)
    .filter(([variant]) => variant !== 'public') // 'public' == 'medium' (mesmo byte a byte); evita w duplicado
    .map(([variant, w]) => `${base}/${variant} ${w}w`)
    .join(', ');
}

interface ProductThumbProps {
  src: string | null;
  fallbackSrc?: string | null;
  alt: string;
  ratio?: 'square' | '4/3';
  priority?: boolean;
  iconSize?: string;
  sizes?: string;
}

/**
 * Imagem do card/galeria com skeleton até carregar, srcSet real do
 * Cloudflare Images (quando aplicável) e fallback em cascata
 * src -> fallbackSrc -> ícone Package. Substitui ProductImage (E04) nos
 * dois usos existentes; ProductImage continua exportado (sem uso restante
 * após esta etapa, mas outros pontos futuros podem precisar do fallback simples).
 */
export function ProductThumb({ src, fallbackSrc, alt, ratio = 'square', priority, iconSize = 'w-8 h-8', sizes }: ProductThumbProps) {
  const [stage, setStage] = useState<'loading' | 'loaded' | 'error-src' | 'error-fallback'>(
    src ? 'loading' : fallbackSrc ? 'loading' : 'error-fallback'
  );
  const effectiveSrc = stage === 'error-src' ? fallbackSrc : src ?? fallbackSrc;

  if (!effectiveSrc || stage === 'error-fallback') {
    return (
      <div className={`w-full h-full flex items-center justify-center ${ratio === '4/3' ? 'aspect-[4/3]' : 'aspect-square'}`}>
        <Package className={`${iconSize} text-muted-foreground`} />
      </div>
    );
  }

  const srcSet = cfImagesSrcSet(effectiveSrc);

  return (
    <div className={`relative w-full h-full ${ratio === '4/3' ? 'aspect-[4/3]' : 'aspect-square'}`}>
      {stage === 'loading' && <div className="absolute inset-0 animate-pulse bg-muted/40" />}
      <img
        src={effectiveSrc}
        srcSet={srcSet ?? undefined}
        sizes={srcSet ? sizes ?? '(min-width: 1280px) 220px, (min-width: 768px) 33vw, 50vw' : undefined}
        alt={alt}
        className={`w-full h-full object-contain transition-opacity ${stage === 'loading' ? 'opacity-0' : 'opacity-100'}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        onLoad={() => setStage('loaded')}
        onError={() => setStage((s) => (s === 'error-src' ? 'error-fallback' : 'error-src'))}
      />
    </div>
  );
}

// ─── FavoriteButton (E16) ───────────────────────────────────────
import { Heart } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
  busy?: boolean;
  size?: number;
}

/**
 * Coração do canto superior direito (card e galeria). Sem persistência
 * até a E27 (catalog_favorites) — não montar nos cards antes disso.
 */
export function FavoriteButton({ active, onToggle, busy, size = 32 }: FavoriteButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onToggle();
      }}
      disabled={busy}
      aria-pressed={active}
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className="flex items-center justify-center rounded-full bg-background/70 backdrop-blur disabled:opacity-60"
      style={{ width: size, height: size }}
      animate={!prefersReducedMotion && active ? { scale: [1, 1.2, 1] } : undefined}
      transition={{ duration: 0.3 }}
    >
      <Heart
        className={active ? 'w-4 h-4 fill-destructive text-destructive' : 'w-4 h-4 text-foreground/70'}
      />
    </motion.button>
  );
}

// ─── CatalogKpiStrip (E17) ──────────────────────────────────────
import { Box, Folder, Users, Package as PackageIcon, Star as StarIcon, Sparkles as SparklesIcon } from 'lucide-react';
import { KpiCard, KpiCardSkeleton, type TileColor } from '@/components/talkx/talkxShared';

/** Formato esperado da E24 (catalog_stats); todos os campos numéricos são opcionais. */
export interface CatalogStats {
  total?: number | null;
  categories_root?: number | null;
  suppliers_active?: number | null;
  in_stock?: number | null;
  featured?: number | null;
  new_30d?: number | null;
}

interface KpiDef {
  key: keyof CatalogStats;
  label: string;
  icon: typeof Box;
  color: TileColor;
}

const CATALOG_KPI_DEFS: KpiDef[] = [
  { key: 'total', label: 'Produtos no total', icon: Box, color: 'blue' },
  { key: 'categories_root', label: 'Categorias', icon: Folder, color: 'amber' },
  { key: 'suppliers_active', label: 'Fornecedores', icon: Users, color: 'blue' },
  { key: 'in_stock', label: 'Em estoque', icon: PackageIcon, color: 'green' },
  { key: 'featured', label: 'Em destaque', icon: StarIcon, color: 'blue' },
  { key: 'new_30d', label: 'Novidades', icon: SparklesIcon, color: 'amber' },
];

interface CatalogKpiStripProps {
  stats: CatalogStats | null | undefined;
  loading?: boolean;
  /** Clique aplica o filtro correspondente (ligado nas etapas E33/E36). */
  onSelect?: (key: keyof CatalogStats) => void;
}

/**
 * 6 KPIs do topo do mock A. Cada card só aparece se o campo vier como
 * número (a RPC catalog_stats da E24 ainda não existe — hoje `stats` é
 * `undefined` e o strip inteiro fica oculto, sem "—" decorativo).
 */
export function CatalogKpiStrip({ stats, loading, onSelect }: CatalogKpiStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} compact />)}
      </div>
    );
  }
  const visible = CATALOG_KPI_DEFS.filter((d) => typeof stats?.[d.key] === 'number');
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {visible.map((d, i) => (
        <button
          key={d.key}
          type="button"
          onClick={() => onSelect?.(d.key)}
          disabled={!onSelect}
          className="text-left disabled:cursor-default"
        >
          <KpiCard
            icon={d.icon}
            color={d.color}
            label={d.label}
            value={(stats![d.key] as number).toLocaleString('pt-BR')}
            compact
            index={i}
          />
        </button>
      ))}
    </div>
  );
}
