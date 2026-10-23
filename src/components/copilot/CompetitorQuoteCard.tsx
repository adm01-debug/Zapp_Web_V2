import React from 'react';
import type { CompetitorItem } from '@/hooks/copilot/useCompetitorQuoteAnalysis';

export interface CompetitorQuoteCardProps {
  items: CompetitorItem[];
  competitorTotal: number | null;
  ourAdvantage: string | null;
  className?: string;
}

export function CompetitorQuoteCard({ items, competitorTotal, ourAdvantage, className = '' }: CompetitorQuoteCardProps) {
  if (items.length === 0) return null;

  const isAdvantage = ourAdvantage?.startsWith('Nossa');

  return (
    <div className={`rounded-lg border border-blue-200 bg-blue-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-base">🔍</span>
        <span className="text-xs font-semibold text-blue-800">Orçamento do concorrente</span>
        <span className="ml-auto rounded-full bg-blue-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800">
          Uso interno
        </span>
      </div>

      <table className="mb-2 w-full text-[10px]">
        <thead>
          <tr className="text-left text-blue-600">
            <th className="pb-1 font-medium">Item</th>
            <th className="pb-1 font-medium text-right">Qtd</th>
            <th className="pb-1 font-medium text-right">Unit</th>
            <th className="pb-1 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-blue-100 text-blue-900">
              <td className="py-0.5 pr-2">{item.description}</td>
              <td className="py-0.5 text-right">{item.quantity ?? '—'}</td>
              <td className="py-0.5 text-right">
                {item.unitPrice != null ? `R$ ${item.unitPrice.toFixed(2)}` : '—'}
              </td>
              <td className="py-0.5 text-right">
                {item.total != null ? `R$ ${item.total.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
          {competitorTotal != null && (
            <tr className="border-t border-blue-300 font-semibold text-blue-900">
              <td colSpan={3} className="py-1">Total concorrente</td>
              <td className="py-1 text-right">R$ {competitorTotal.toFixed(2)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {ourAdvantage && (
        <p className={`rounded px-2 py-1 text-[10px] font-medium ${isAdvantage ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
          {ourAdvantage}
        </p>
      )}
    </div>
  );
}
