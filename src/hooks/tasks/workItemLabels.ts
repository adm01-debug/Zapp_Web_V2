import type { Priority } from './workItem.types';

/**
 * Rótulos de prioridade em pt-BR. Ficam num `.ts` (e não no `PriorityChip.tsx`)
 * de propósito: exportar constante de arquivo de componente esbarra no
 * `react-refresh/only-export-components`, que conta dívida NOVA no lint-ratchet.
 */
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baixa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
};
