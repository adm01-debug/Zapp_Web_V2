/* eslint-disable react-refresh/only-export-components */
/**
 * Helpers e primitivos compartilhados do módulo Catálogo.
 * Ponto único para evitar duplicação entre ExternalProductCard,
 * ProductDetailDialog e demais componentes de src/components/catalog/.
 */
import React from 'react';
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

interface ProductImageProps {
  src: string | null;
  alt: string;
  iconSize?: string;
  /** E21 — fallback secundário (primary_image_fallback_url) antes do ícone genérico. */
  fallbackSrc?: string | null;
}

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, iconSize = 'w-6 h-6', fallbackSrc }) => {
  const effectiveSrc = src ?? fallbackSrc ?? null;
  return effectiveSrc ? (
    <>
      <img src={effectiveSrc} alt={alt} className="w-full h-full object-cover" loading="lazy" onError={handleImageError} />
      <div className="w-full h-full items-center justify-center hidden"><Package className={`${iconSize} text-muted-foreground`} /></div>
    </>
  ) : (
    <div className="w-full h-full flex items-center justify-center"><Package className={`${iconSize} text-muted-foreground`} /></div>
  );
};

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
