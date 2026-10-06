import { addDays, startOfDay } from 'date-fns';
import type { SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { log } from '@/lib/logger';
import type { Database } from '@/integrations/supabase/types';

export interface QueueMetrics {
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  /** Tempo médio de primeira resposta, formatado, ou "Sem dados" quando não há amostra. */
  avgResponseTime: string;
  resolvedToday: number;
}

/** Amostra de `conversation_sla` usada no tempo médio de primeira resposta. */
export interface SlaSample {
  first_message_at: string | null;
  first_response_at: string | null;
}

/**
 * Contagens de `contacts` medidas no servidor para a fila INTEIRA — nunca derivadas da página de
 * 50 contatos que a tabela visual carrega (R2-QUE-001/R2-QUE-003).
 */
export interface QueueMetricCounts {
  totalContacts: number;
  assignedContacts: number;
  resolvedToday: number;
}

/**
 * Superfície do cliente Supabase usada pelas métricas, INJETADA pela página.
 *
 * A camada de apresentação não importa o client do Supabase (regra do repo: acesso a dados vive em
 * hook/service). Recebendo o cliente por parâmetro, `fetchQueueMetrics` continua testável sem mock
 * de módulo — e o import restrito não volta como dívida de lint nova.
 */
export type QueueMetricsClient = Pick<SupabaseJsClient<Database>, 'from'>;

/** Página pedida explicitamente ao PostgREST na leitura de `conversation_sla` (teto padrão é 1000). */
export const SLA_PAGE_SIZE = 1000;

/** Formata uma duração em ms para texto curto (s / min / h). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} min`;
  return `${(totalSeconds / 3600).toFixed(1)} h`;
}

/**
 * Janela semiaberta do dia corrente: `[início de hoje, início de amanhã)` em ISO.
 *
 * É o recorte canônico de "hoje" (nunca `isSameDay`, que é comparação de calendário sobre uma
 * amostra truncada): o intervalo é fechado no começo e aberto no fim, então um contato resolvido
 * às 23:59 de hoje entra e um resolvido às 00:00 de amanhã não entra.
 */
export function todayWindow(now: Date): { start: string; end: string } {
  const start = startOfDay(now);
  return { start: start.toISOString(), end: addDays(start, 1).toISOString() };
}

/**
 * Deriva o cartão de métricas a partir das contagens do SERVIDOR e das amostras de SLA.
 *
 * Puro de propósito: nenhuma contagem sai de uma lista de contatos (a página de 50 é só amostra da
 * tabela), `resolvedToday` vem do status canônico medido no banco e `avgResponseTime` é a média das
 * amostras com primeira resposta real — sem amostra válida devolve "Sem dados" em vez de um valor
 * fixo "min".
 */
export function computeQueueMetrics(counts: QueueMetricCounts, slaSamples: SlaSample[]): QueueMetrics {
  const durations = slaSamples
    .filter((r) => r.first_message_at && r.first_response_at)
    .map((r) => new Date(r.first_response_at as string).getTime() - new Date(r.first_message_at as string).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  const avgResponseTime = durations.length
    ? formatDuration(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
    : 'Sem dados';

  return {
    totalContacts: counts.totalContacts,
    assignedContacts: counts.assignedContacts,
    waitingContacts: Math.max(counts.totalContacts - counts.assignedContacts, 0),
    avgResponseTime,
    resolvedToday: counts.resolvedToday,
  };
}

/**
 * Lê TODAS as amostras de `conversation_sla` da fila (paginando explicitamente) pela relação com
 * `contacts.queue_id` — não por uma lista de IDs montada sobre os 50 contatos exibidos.
 *
 * Fail-closed: erro de leitura (ou leitura que parou no teto de páginas) devolve zero amostras e o
 * erro, para o cartão mostrar "Sem dados" em vez de uma média calculada sobre dados parciais.
 */
async function readQueueSlaSamples(
  client: QueueMetricsClient,
  queueId: string,
): Promise<{ rows: SlaSample[]; error: { message: string } | null }> {
  try {
    const { rows, incomplete, error } = await fetchAllRows<SlaSample>(
      (from, to) =>
        client
          .from('conversation_sla')
          .select('first_message_at, first_response_at, contacts!inner(queue_id)')
          .eq('contacts.queue_id', queueId)
          .order('id', { ascending: true })
          .range(from, to),
      { pageSize: SLA_PAGE_SIZE },
    );
    if (error) return { rows: [], error };
    if (incomplete) {
      return { rows: [], error: { message: `a leitura de conversation_sla parou no teto de páginas (${SLA_PAGE_SIZE} por página)` } };
    }
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? { message: e.message } : { message: String(e) } };
  }
}

/**
 * Métricas da fila inteira (R2-QUE-001 / R2-QUE-003).
 *
 * Contagens de `contacts` (total, atribuídos e resolvidos hoje) vêm de `count: 'exact', head: true`
 * — o servidor conta a fila completa, não a página de 50. O tempo médio vem de todas as amostras de
 * `conversation_sla` da fila, paginadas. Erro nas contagens sobe para o tratamento geral de
 * `QueueDetails`; erro na leitura de SLA é fail-closed (`Sem dados`) e não derruba as contagens.
 */
export async function fetchQueueMetrics(client: QueueMetricsClient, queueId: string, now: Date): Promise<QueueMetrics> {
  const { start, end } = todayWindow(now);

  const [total, assigned, resolvedToday] = await Promise.all([
    client.from('contacts').select('id', { count: 'exact', head: true }).eq('queue_id', queueId),
    client.from('contacts').select('id', { count: 'exact', head: true }).eq('queue_id', queueId).not('assigned_to', 'is', null),
    client
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('queue_id', queueId)
      .eq('conversation_status', 'resolved')
      .gte('conversation_status_changed_at', start)
      .lt('conversation_status_changed_at', end),
  ]);

  if (total.error) throw total.error;
  if (assigned.error) throw assigned.error;
  if (resolvedToday.error) throw resolvedToday.error;

  const sla = await readQueueSlaSamples(client, queueId);
  if (sla.error) {
    log.error('Falha ao ler as amostras de SLA da fila; Tempo Médio exibido como "Sem dados":', sla.error);
  }

  return computeQueueMetrics(
    {
      totalContacts: total.count ?? 0,
      assignedContacts: assigned.count ?? 0,
      resolvedToday: resolvedToday.count ?? 0,
    },
    sla.rows,
  );
}
