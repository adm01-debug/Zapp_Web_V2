/**
 * CV-086, CV-087, CV-088, CV-089 — Card de rascunho de orçamento.
 * Exibe tabela de itens, subtotal, frete estimado, total, marca-d'água
 * "Em revisão" e, quando disponível, sugestão de upsell.
 * NUNCA exibe botão "Enviar ao cliente" — status é sempre rascunho.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { QuoteDraft, QuoteItem } from '@/hooks/copilot/useQuoteDraft';

export interface QuoteDraftCardProps {
  draft: QuoteDraft | null;
  onAddItem?: () => void;
  className?: string;
}

function formatCurrency(value: number, currency = 'BRL'): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency });
}

function ItemRow({ item }: { item: QuoteItem }) {
  return (
    <tr className="border-t border-gray-100 text-xs">
      <td className="py-1.5 pr-2 text-gray-800">{item.name}</td>
      <td className="py-1.5 pr-2 text-right text-gray-600">{item.quantity} un.</td>
      <td className="py-1.5 pr-2 text-right text-gray-600">
        {formatCurrency(item.unitPrice)}
      </td>
      <td className="py-1.5 text-right font-medium text-gray-800">
        {formatCurrency(item.totalPrice)}
      </td>
    </tr>
  );
}

export function QuoteDraftCard({ draft, onAddItem, className }: QuoteDraftCardProps) {
  if (!draft) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400',
          className,
        )}
      >
        Preencha os dados do brinde para gerar o rascunho.
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-lg border border-gray-200 bg-white shadow-sm', className)}>
      {/* Watermark */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5 select-none"
        aria-hidden
      >
        <span className="rotate-[-30deg] text-6xl font-black uppercase tracking-widest text-gray-600">
          Rascunho
        </span>
      </div>

      <div className="relative p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Rascunho de Orçamento</h3>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              draft.status === 'pending_review'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600',
            )}
          >
            {draft.status === 'pending_review' ? 'Aguardando revisão' : 'Rascunho'}
          </span>
        </div>

        {/* Items table */}
        {draft.items.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-1 pr-2 text-left font-normal">Produto</th>
                <th className="pb-1 pr-2 text-right font-normal">Qtd.</th>
                <th className="pb-1 pr-2 text-right font-normal">Unit.</th>
                <th className="pb-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((item) => (
                <ItemRow key={item.productId} item={item} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-400 italic">Nenhum item adicionado.</p>
        )}

        {/* Pending fields */}
        {draft.pendingFields.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Campos pendentes: {draft.pendingFields.join(', ')}
          </div>
        )}

        {/* Totals */}
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(draft.subtotal)}</span>
          </div>

          {draft.freight && (
            <div className="flex justify-between text-gray-500">
              <span>
                Frete est. (CEP {draft.freight.cep}){' '}
                <span className="text-gray-400 italic">— {draft.freight.disclaimer}</span>
              </span>
              <span>
                {formatCurrency(draft.freight.estimatedMin, draft.freight.currency)}–
                {formatCurrency(draft.freight.estimatedMax, draft.freight.currency)}
              </span>
            </div>
          )}

          <div className="flex justify-between font-semibold text-gray-800">
            <span>Total estimado</span>
            <span>{formatCurrency(draft.total)}</span>
          </div>
        </div>

        {/* Upsell chip */}
        {draft.upsellSuggestion && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <span className="mt-0.5 text-base" aria-hidden>💡</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-800">
                {draft.upsellSuggestion.name}
              </p>
              <p className="text-xs text-blue-700">{draft.upsellSuggestion.description}</p>
              {draft.upsellSuggestion.estimatedPrice > 0 && (
                <p className="mt-0.5 text-xs text-blue-600">
                  + {formatCurrency(draft.upsellSuggestion.estimatedPrice)} / un.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Add item action */}
        {onAddItem && (
          <button
            type="button"
            onClick={onAddItem}
            className="mt-3 w-full rounded-md border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Adicionar produto
          </button>
        )}
      </div>
    </div>
  );
}
