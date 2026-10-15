import type { InboxFiltersState } from './InboxFilters';

/**
 * Converte o JSON gravado em `saved_filters.filters` para o estado que a lista
 * entende. As datas vão como ISO (o JSON do banco não guarda `Date`) e voltam
 * como `Date` na leitura — sem isso o filtro salvo nunca reaplicava o período.
 *
 * Vive neste módulo (e não em `InboxFilters.tsx`) para o popover e a linha de
 * chips rápidos (`SavedFilterChips`) compartilharem a conversão sem violar o
 * react-refresh (component file só exporta componente).
 */
export function savedFilterToState(filters: Record<string, unknown>): InboxFiltersState {
  const range = (filters.dateRange ?? {}) as { from?: string | null; to?: string | null };
  return {
    status: Array.isArray(filters.status) ? (filters.status as string[]) : [],
    tags: Array.isArray(filters.tags) ? (filters.tags as string[]) : [],
    agentId: typeof filters.agentId === 'string' ? filters.agentId : null,
    dateRange: {
      from: range.from ? new Date(range.from) : null,
      to: range.to ? new Date(range.to) : null,
    },
  };
}
