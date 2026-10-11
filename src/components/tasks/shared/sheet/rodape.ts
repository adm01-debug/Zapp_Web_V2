/**
 * Etapa 142 (rodapé do painel): as duas decisões do menu ⋮ que valem função
 * pura — quando "Reabrir" aparece e qual é o link INTERNO da tarefa.
 *
 * O link é uma URL da própria aplicação (`?view=tasks&task=<id>`), a mesma que
 * o `useWorkItemNotifications.openTask` grava na barra de endereço: navegação
 * interna, nenhum dado de cliente saiu do sistema (regra 08/10/2026).
 */
import type { WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** Só faz sentido reabrir o que já terminou (concluída ou cancelada). */
export function podeReabrir(status: WorkItemStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

export interface LocalizadorURL {
  origin: string;
  pathname: string;
}

export function linkInternoDaTarefa(id: string, loc: LocalizadorURL): string {
  return `${loc.origin}${loc.pathname}?view=tasks&task=${encodeURIComponent(id)}`;
}
