import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

const log = getLogger('InboxSilence');

// Acompanhamento a cada 60 s. O `useVisiblePolling` só dispara com a aba visível e
// online e para assim que a aba é escondida: não existe consulta em segundo plano.
export const INBOX_SILENCE_POLL_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;

export interface InboxSilenceConversation {
  contact_id: string;
  contact_name: string | null;
  received: number;
  last_at: string | null;
}

export interface InboxSilenceConnection {
  connection_id: string;
  connection_name: string | null;
  connection_status: string | null;
  received_5m: number;
  received_1h: number;
  received_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  // Limiar configurado em `global_settings.inbox_silence_minutes`. O valor chega
  // pela RPC (que lê a chave no servidor) — o front nunca crava o número.
  silence_minutes: number;
  is_silent: boolean;
  top_conversations: InboxSilenceConversation[];
}

export interface InboxSilenceAlert {
  connection_id: string;
  connection_name: string | null;
  // Última mensagem RECEBIDA da conexão: é desde aí que ela está muda.
  silence_since: string | null;
  silence_minutes: number;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapConversations(value: unknown): InboxSilenceConversation[] {
  if (!Array.isArray(value)) return [];
  const rows: InboxSilenceConversation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const contactId = toText(raw.contact_id);
    if (!contactId) continue;
    rows.push({
      contact_id: contactId,
      contact_name: toText(raw.contact_name),
      received: toNumber(raw.received),
      last_at: toText(raw.last_at),
    });
  }
  return rows;
}

function mapRow(raw: Record<string, unknown>): InboxSilenceConnection {
  return {
    connection_id: toText(raw.connection_id) ?? '',
    connection_name: toText(raw.connection_name),
    connection_status: toText(raw.connection_status),
    received_5m: toNumber(raw.received_5m),
    received_1h: toNumber(raw.received_1h),
    received_24h: toNumber(raw.received_24h),
    last_inbound_at: toText(raw.last_inbound_at),
    last_outbound_at: toText(raw.last_outbound_at),
    silence_minutes: toNumber(raw.silence_minutes),
    is_silent: raw.is_silent === true,
    top_conversations: mapConversations(raw.top_conversations),
  };
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
      const { data, error: rpcError } = await supabase
        .rpc('admin_inbox_silence')
        .abortSignal(requestSignal);
      // Resposta de uma leitura já cancelada (aba escondida/desmontada): descarta.
      if (signal.aborted) return;
      if (rpcError) throw rpcError;

      const rows = (data ?? []).map(raw => mapRow(raw as Record<string, unknown>));
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
