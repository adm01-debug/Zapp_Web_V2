import { useCallback, useRef, useState } from 'react';
import { fetchInboxSilence, type InboxSilenceConnection } from '@/services/inbox.service';
import { getLogger } from '@/lib/logger';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

const log = getLogger('InboxSilence');

// Acompanhamento a cada 60 s. O `useVisiblePolling` só dispara com a aba visível e
// online e para assim que a aba é escondida: não existe consulta em segundo plano.
export const INBOX_SILENCE_POLL_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;

export type { InboxSilenceConnection, InboxSilenceConversation } from '@/services/inbox.service';

export interface InboxSilenceAlert {
  connection_id: string;
  connection_name: string | null;
  // Última mensagem RECEBIDA da conexão: é desde aí que ela está muda.
  silence_since: string | null;
  silence_minutes: number;
}

/**
 * Monitor de silêncio da caixa de entrada (admin/supervisor).
 *
 * `alerts` é o aviso "uma vez por episódio": cada conexão entra na lista quando
 * fica muda e só sai quando volta a chegar mensagem (`is_silent` volta a false)
 * ou a conexão deixa de ser relatada. Enquanto continuar muda nas leituras
 * seguintes, o alerta NÃO se repete; depois que ela recupera, um novo episódio
 * de silêncio volta a avisar.
 */
export function useInboxSilence(enabled = true) {
  const [connections, setConnections] = useState<InboxSilenceConnection[]>([]);
  const [alerts, setAlerts] = useState<InboxSilenceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alertsRef = useRef<Map<string, InboxSilenceAlert>>(new Map());

  const applyRows = useCallback((rows: InboxSilenceConnection[]) => {
    const previous = alertsRef.current;
    const next = new Map(previous);
    const byId = new Map(rows.map(row => [row.connection_id, row]));
    let changed = false;

    // Fim do episódio: a mensagem voltou a chegar (is_silent=false) ou a conexão
    // não é mais relatada. O alerta some e um novo episódio poderá avisar de novo.
    previous.forEach((_alert, id) => {
      const row = byId.get(id);
      if (!row || !row.is_silent) {
        next.delete(id);
        changed = true;
      }
    });

    // Início do episódio: só entra quem ficou mudo agora. Quem já está na lista
    // segue mudo sem gerar outro aviso.
    for (const row of rows) {
      if (!row.is_silent || next.has(row.connection_id)) continue;
      next.set(row.connection_id, {
        connection_id: row.connection_id,
        connection_name: row.connection_name,
        silence_since: row.last_inbound_at,
        silence_minutes: row.silence_minutes,
      });
      changed = true;
    }

    // Nada mudou: mantém a MESMA lista (mesma referência). Quem observa `alerts`
    // não recebe um alerta repetido a cada 60 s enquanto a caixa seguir muda.
    if (!changed) return;

    alertsRef.current = next;
    setAlerts([...next.values()]);
  }, []);

  const read = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(RPC_TIMEOUT_MS)]);
    try {
      const rows = await fetchInboxSilence(requestSignal);
      // Resposta de uma leitura já cancelada (aba escondida/desmontada): descarta.
      if (signal.aborted) return;

      setConnections(rows);
      setError(null);
      applyRows(rows);
    } catch (err) {
      if (signal.aborted) return;
      // Mantém o último retrato bom (conexões e alertas) e mostra o erro; o ciclo
      // repete em 60 s. `loading` sempre sai do estado inicial.
      setError('Não foi possível ler o silêncio da caixa de entrada.');
      log.error('Falha ao ler o silêncio da caixa de entrada:', err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [applyRows]);

  const refresh = useVisiblePolling(read, INBOX_SILENCE_POLL_MS, enabled);

  const silenceMinutes = connections[0]?.silence_minutes ?? null;

  return { connections, alerts, silenceMinutes, loading, error, refresh };
}
