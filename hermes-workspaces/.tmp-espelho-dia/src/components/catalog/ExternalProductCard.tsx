/**
 * ExternalProductCard — wrapper fino que delega para CatalogProductCard.
 * Mantido para compatibilidade com import existente em ExternalProductManagement.
 */
import React from 'react';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { CatalogProductCard } from './CatalogProductCard';

interface ExternalProductCardProps {
  product: ExternalProduct;
  /** Cor selecionada no detalhe, quando o envio parte de uma variação. */
  onSend?: (product: ExternalProduct, variantColor?: string) => void;
  /** compact = modo lista; sem compact = grade */
  compact?: boolean;
  /** E43: favoritos */
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  /** E47: seleção em massa */
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** CT-72: capa acima da dobra — prioriza o carregamento da imagem. */
  priority?: boolean;
  /** CT-72: sizes por breakpoint, repassado ao ProductThumb. */
  sizes?: string;
}

export const ExternalProductCard: React.FC<ExternalProductCardProps> = ({
  product,
  onSend,
  compact = false,
  isFavorite = false,
  onToggleFavorite,
  isSelected = false,
  onToggleSelect,
  priority,
  sizes,
}) => (
  <CatalogProductCard
    product={product}
    onSend={onSend}
    mode={compact ? 'list' : 'grade'}
    isFavorite={isFavorite}
    onToggleFavorite={onToggleFavorite}
    isSelected={isSelected}
    onToggleSelect={onToggleSelect}
    priority={priority}
    sizes={sizes}
  />
);
