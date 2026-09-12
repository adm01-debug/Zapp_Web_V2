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
