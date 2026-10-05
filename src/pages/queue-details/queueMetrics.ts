import { isSameDay } from 'date-fns';

export interface QueueMetrics {
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  /** Tempo médio de primeira resposta, formatado, ou "Sem dados" quando não há amostra. */
  avgResponseTime: string;
  resolvedToday: number;
}

interface MetricContact {
  assigned_to: string | null;
  conversation_status: string | null;
  conversation_status_changed_at: string | null;
}

interface SlaSample {
  first_message_at: string | null;
  first_response_at: string | null;
}

/** Formata uma duração em ms para texto curto (s / min / h). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} min`;
  return `${(totalSeconds / 3600).toFixed(1)} h`;
}

/**
 * R2-QUE-001 (item 105): deriva as métricas do cartão de fila a partir de dados medidos.
 *
 * - `resolvedToday` conta contatos com status canônico `resolved` cuja mudança de status
 *   (`conversation_status_changed_at`) caiu no dia corrente — não é `floor(atribuídos * 0.7)`.
 * - `avgResponseTime` é a média de `first_response_at - first_message_at` das amostras de SLA com
 *   primeira resposta real; sem amostra válida devolve "Sem dados" em vez de um valor fixo "~3 min".
 */
export function computeQueueMetrics(contacts: MetricContact[], slaRows: SlaSample[], now: Date): QueueMetrics {
  const totalContacts = contacts.length;
  const assignedContacts = contacts.filter((c) => c.assigned_to).length;
  const waitingContacts = totalContacts - assignedContacts;

  const resolvedToday = contacts.filter((c) => {
    if (c.conversation_status !== 'resolved') return false;
    if (!c.conversation_status_changed_at) return false;
    return isSameDay(new Date(c.conversation_status_changed_at), now);
  }).length;

  const durations = slaRows
    .filter((r) => r.first_message_at && r.first_response_at)
    .map((r) => new Date(r.first_response_at as string).getTime() - new Date(r.first_message_at as string).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  const avgResponseTime = durations.length
    ? formatDuration(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
    : 'Sem dados';

  return { totalContacts, assignedContacts, waitingContacts, avgResponseTime, resolvedToday };
}
