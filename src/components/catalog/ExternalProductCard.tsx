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
}

export const ExternalProductCard: React.FC<ExternalProductCardProps> = ({ product, onSend, compact = false }) => (
  <CatalogProductCard product={product} onSend={onSend} mode={compact ? 'list' : 'grade'} />
);
