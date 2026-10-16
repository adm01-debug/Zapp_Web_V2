/**
 * CV-081 — Card de recomendação de produtos.
 * Exibe até 3 recomendações com foto placeholder, faixa de preço,
 * badge de estoque e chip de justificativa.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { ProductRecommendation, ProductStock } from '@/hooks/copilot/useProductRecommendation';

export interface ProductRecommendationCardProps {
  recommendations: ProductRecommendation[];
  stockAlert?: ProductRecommendation | null;
  onRefresh: () => void;
  isLoading: boolean;
  className?: string;
}

function StockBadge({ stock }: { stock: ProductStock }) {
  const map: Record<ProductStock, { label: string; className: string }> = {
    available: { label: 'Disponível', className: 'bg-green-100 text-green-800' },
    low: { label: 'Estoque baixo', className: 'bg-yellow-100 text-yellow-800' },
    out_of_stock: { label: 'Esgotado', className: 'bg-red-100 text-red-800' },
  };
  const { label, className } = map[stock];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {label}
    </span>
  );
}

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ProductCard({ product }: { product: ProductRecommendation }) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {/* Photo placeholder */}
      <div className="h-14 w-14 flex-shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl text-gray-400" aria-hidden>🎁</span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <p className="truncate text-sm font-semibold text-gray-800">{product.name}</p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">
            {formatPrice(product.priceRange.min)}–{formatPrice(product.priceRange.max)}{' '}
            / {product.priceRange.unit}
          </span>
          <span className="text-xs text-gray-400">
            Mín. {product.minimumQty} un.
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <StockBadge stock={product.stock} />
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            {product.reason}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProductRecommendationCard({
  recommendations,
  stockAlert,
  onRefresh,
  isLoading,
  className,
}: ProductRecommendationCardProps) {
  const shown = recommendations.slice(0, 3);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Produtos recomendados</h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          aria-label="Atualizar recomendações"
        >
          {isLoading ? (
            <span className="animate-spin">↻</span>
          ) : (
            <span>↻</span>
          )}
          Atualizar
        </button>
      </div>

      {/* Stock alert */}
      {stockAlert && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          ⚠ <strong>{stockAlert.name}</strong>:{' '}
          {stockAlert.stock === 'out_of_stock' ? 'esgotado' : 'estoque baixo'} — confirme disponibilidade antes de fechar.
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="flex justify-center py-6 text-gray-400 text-sm">
          Carregando recomendações…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
          Nenhuma recomendação disponível.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((p) => (
            <ProductCard key={p.productId} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
