/**
 * ExternalProductCard — wrapper fino que delega para CatalogProductCard.
 * Mantido para compatibilidade com import existente em ExternalProductManagement.
 */
import React from 'react';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { CatalogProductCard } from './CatalogProductCard';

interface ExternalProductCardProps {
  product: ExternalProduct;
  onSend?: (product: ExternalProduct) => void;
  /** compact = modo lista; sem compact = grade */
  compact?: boolean;
  /** E43: favoritos */
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  /** E47: seleção em massa */
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const ExternalProductCard: React.FC<ExternalProductCardProps> = ({
  product,
  onSend,
  compact = false,
  isFavorite = false,
  onToggleFavorite,
  isSelected = false,
  onToggleSelect,
}) => (
  <CatalogProductCard
    product={product}
    onSend={onSend}
    mode={compact ? 'list' : 'grade'}
    isFavorite={isFavorite}
    onToggleFavorite={onToggleFavorite}
    isSelected={isSelected}
    onToggleSelect={onToggleSelect}
  />
);
