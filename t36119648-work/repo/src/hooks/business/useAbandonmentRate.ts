import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * R2-MOD-020 — taxa de abandono por SESSÃO e por ORDEM temporal.
 *
 * O defeito do baseline (`AbandonmentRate` só lia `contact_id` e `sender`): qualquer mensagem
 * de agente no período "respondia" o contato, então a mensagem do agente das 10h atendia a
 * demanda do cliente das 11h — e o contato saía do conjunto abandonado sem ninguém ter
 * respondido. Também não havia sessão: o mesmo contato era sempre um só, e as linhas vinham da
 * primeira página de 1 000 do PostgREST (`.limit(1000)` sem `range` nem `order`).
 *
 * Contrato daqui:
 *  - leitura paginada (`fetchAllRows`) e ordenada por chave única (`id`, ordem estável entre
 *    páginas): o denominador é o período, não uma amostra;
 *  - as mensagens do mesmo contato são lidas em ordem cronológica e separadas em SESSÕES por
 *    mais de `SESSION_SILENCE_MS` de silêncio (mesmo contrato de sessão do filtro
 *    "Última interação" do chat — `useChatSearch`, gap > 4h);
 *  - denominador = sessões com pelo menos uma mensagem do cliente (campanha só de agente não é
 *    demanda do cliente e fica fora);
 *  - a sessão é RESPONDIDA quando existe mensagem de agente DEPOIS da última mensagem do
 *    cliente da sessão (a resposta tem de vir depois da demanda, não antes);
 *  - demanda sem resposta que já esperou MAIS que `RESPONSE_DEADLINE_MS` é ABANDONO; dentro do
 *    prazo é "aguardando" (ainda não medido), para o relatório não publicar como abandonado o
 *    que pode ser atendimento em curso.
 */

/** Silêncio que separa sessões: o mesmo contrato do filtro "Última interação" (`useChatSearch`). */
export const SESSION_SILENCE_MS = 4 * 60 * 60 * 1000;

/** Prazo de espera da resposta: passou disto sem resposta, a demanda vira abandono. */
export const RESPONSE_DEADLINE_MS = SESSION_SILENCE_MS;

export interface AbandonmentMessage {
  id: string;
  created_at: string;
  sender: string;
  contact_id: string | null;
}

export interface AbandonmentMetric {
  /** Sessões com demanda do cliente no período (denominador explícito). */
  total: number;
  /** Sessões respondidas: agente falou depois da última mensagem do cliente da sessão. */
  responded: number;
  /** Sessões cuja última demanda do cliente esperou mais que o prazo sem resposta. */
  abandoned: number;
  /** Sessões sem resposta, ainda DENTRO do prazo (nem abandono, nem atendimento). */
  waiting: number;
  /** `abandoned / total`, em % inteiros. */
  rate: number;
}

export interface AbandonmentRateState {
  /** `null` enquanto não há leitura: o relatório mostra "—" em vez de zero não medido. */
  metric: AbandonmentMetric | null;
  loading: boolean;
  error: unknown;
  /** A leitura parou no meio: os números vêm do que deu para ler, não do período inteiro. */
  incomplete: boolean;
}

/** Sessões do contato: mensagens em ordem cronológica (desempate por `id`), separadas por silêncio > `SESSION_SILENCE_MS`. */
function sessionsOf(messages: AbandonmentMessage[]): AbandonmentMessage[][] {
  const ordered = [...messages].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const sessions: AbandonmentMessage[][] = [];
  for (const message of ordered) {
    const current = sessions[sessions.length - 1];
    const previous = current?.[current.length - 1];
    const gap = previous
      ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    if (!current || gap > SESSION_SILENCE_MS) sessions.push([message]);
    else current.push(message);
  }
  return sessions;
}

/** Métrica de abandono sobre as mensagens lidas. `windowEnd` é o fim da janela consultada. */
export function computeAbandonmentRate(
  messages: AbandonmentMessage[],
  windowEnd: Date,
): AbandonmentMetric {
  const byContact = new Map<string, AbandonmentMessage[]>();
  for (const message of messages) {
    if (!message.contact_id || !message.created_at) continue;
    const list = byContact.get(message.contact_id);
    if (list) list.push(message);
    else byContact.set(message.contact_id, [message]);
  }

  let responded = 0;
  let abandoned = 0;
  let waiting = 0;

  for (const contactMessages of byContact.values()) {
    for (const session of sessionsOf(contactMessages)) {
      const clientMessages = session.filter(m => m.sender === 'contact');
      if (clientMessages.length === 0) continue; // sessão só de agente (campanha) não é demanda

      const lastDemand = new Date(clientMessages[clientMessages.length - 1].created_at).getTime();
      const answered = session.some(
        m => m.sender === 'agent' && new Date(m.created_at).getTime() > lastDemand,
      );

      if (answered) responded += 1;
      else if (windowEnd.getTime() - lastDemand > RESPONSE_DEADLINE_MS) abandoned += 1;
      else waiting += 1;
    }
  }

  const total = responded + abandoned + waiting;
  return {
    total,
    responded,
    abandoned,
    waiting,
    rate: total > 0 ? Math.round((abandoned / total) * 100) : 0,
  };
}

/**
 * Lê o período e devolve a métrica já calculada. `period` é em dias ("1", "7", "30"), como no
 * resto da tela — a janela vai de `agora - period` a `agora`, igual ao baseline.
 */
export function useAbandonmentRate(period = '7'): AbandonmentRateState {
  const { data, isLoading, error } = useQuery({
    queryKey: ['abandonment-rate', period],
    queryFn: async (): Promise<{ metric: AbandonmentMetric | null; error: unknown; incomplete: boolean }> => {
      const windowEnd = new Date();
      const days = Number.parseInt(period);
      const since = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);

      const result = await fetchAllRows<AbandonmentMessage>((from, to) =>
        supabase
          .from('messages')
          .select('id, created_at, sender, contact_id')
          .gte('created_at', since.toISOString())
          .lte('created_at', windowEnd.toISOString())
          .order('id')
          .range(from, to),
      );

      // R2-MOD-019: falha de leitura não vira métrica zero — o número não foi medido.
      if (result.error) return { metric: null, error: result.error, incomplete: true };
      return {
        metric: computeAbandonmentRate(result.rows, windowEnd),
        error: null,
        incomplete: result.incomplete,
      };
    },
  });

  return {
    metric: data?.metric ?? null,
    loading: isLoading,
    error: error ?? data?.error ?? null,
    incomplete: data?.incomplete ?? false,
  };
}
