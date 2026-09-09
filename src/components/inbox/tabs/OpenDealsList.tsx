import { FileText } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmptyState } from '@/components/ui/empty-state';
import { formatBRL } from '@/lib/formatters';
import type { Crm360Deal } from '@/hooks/crm/useContactCrm360';

interface OpenDealsListProps {
  deals: Crm360Deal[];
  /** Corta a lista (usado no resumo do CRM 360°); omitido = lista completa (aba Pedidos). */
  limit?: number;
  emptyMessage?: string;
}

/**
 * Lista de "Propostas em aberto" — compartilhada entre a aba Pedidos (23b) e a
 * aba CRM 360° (2.5 item 5) para não duplicar a mesma leitura de sales_deals.
 */
export function OpenDealsList({ deals, limit, emptyMessage = 'Nenhuma proposta em aberto' }: OpenDealsListProps) {
  const items = limit == null ? deals : deals.slice(0, Math.max(0, limit));

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={emptyMessage}
        description="Propostas em negociação aparecem aqui."
        size="sm"
      />
    );
  }

  return (
    <ul className="space-y-1.5" data-testid="open-deals-list">
      {items.map((deal) => {
        const parsedExpectedCloseDate = deal.expected_close_date ? new Date(deal.expected_close_date) : null;
        const expectedCloseDate = parsedExpectedCloseDate && isValid(parsedExpectedCloseDate) ? parsedExpectedCloseDate : null;
        return (
          <li
            key={deal.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5"
          >
            <div className="min-w-[10rem] flex-1">
              <p className="text-sm font-medium truncate">{deal.title}</p>
              {expectedCloseDate && (
                <p className="text-xs text-muted-foreground">
                  Previsão: {format(expectedCloseDate, 'dd MMM yyyy', { locale: ptBR })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {deal.value != null && (
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatBRL(deal.value)}</span>
              )}
              <span className="h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center bg-warning/15 text-warning border-warning/30">
                Em aberto
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
