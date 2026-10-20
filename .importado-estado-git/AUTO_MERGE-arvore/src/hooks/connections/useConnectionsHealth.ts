import { useMemo, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/**
 * Estado GLOBAL da saúde das conexões do WhatsApp.
 *
 * A V2 só tinha o EvolutionDisconnectBanner: mostrava as desconectadas, reconectava
 * uma por vez e podia ser dispensado — depois de dispensado, ninguém mais via o
 * estado das instâncias. Este módulo concentra o estado num store compartilhado
 * (mesma ideia do useConnectionStatusIndicator da V3), para que qualquer tela leia
 * os mesmos dados sem abrir a sua própria assinatura de realtime.
 *
 * Por que store de módulo e não Context: o estado é global e não muda por árvore
 * de componentes. Um singleton com `useSyncExternalStore` dá UMA assinatura de
 * realtime (canal de nome fixo, sem `Math.random()`), UMA busca inicial e o mesmo
 * histórico de quedas para todos os consumidores, sem exigir um Provider novo no
 * App (que ficaria fora do escopo deste cartão).
 *
 * Histórico de quedas: memória da sessão (aba atual). A tabela `reconnection_logs`
 * do RC1 NÃO existe no banco (conferido: `zapp-esquema reconnection_logs` → nada
 * casa), então não há de onde ler o histórico persistido — quando o RC1 for
 * integrado, `loadPersistedHistory` é o ponto de extensão.
 */

export const CONNECTIONS_HEALTH_CHANNEL = 'connections-health';
const HEALTHY_STATUS = 'connected';
const HISTORY_MAX_ENTRIES = 20;

export interface ConnectionHealth {
  id: string;
  name: string;
  phoneNumber: string | null;
  instanceId: string | null;
  status: string;
  isDefault: boolean;
  healthy: boolean;
}

export interface DisconnectEvent {
  connectionId: string;
  instanceId: string | null;
  name: string;
  at: number;
}

export interface ReconnectResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface ReconnectAllSummary {
  total: number;
  ok: number;
  skipped: number;
  failed: number;
}

export interface ConnectionsHealthState {
  connections: ConnectionHealth[];
  loading: boolean;
  error: string | null;
  history: DisconnectEvent[];
  /** Id da conexão com reconexão individual em andamento (ou null). */
  reconnecting: string | null;
  reconnectingAll: boolean;
}

interface ConnectionRow {
  id: string;
  name?: string | null;
  phone_number?: string | null;
  instance_id?: string | null;
  status?: string | null;
  is_default?: boolean | null;
}

interface RealtimePayload {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: ConnectionRow;
  old?: { id?: string };
}

interface ConnectionsHealthChannel {
  on(
    event: string,
    filter: Record<string, unknown>,
    callback: (payload: RealtimePayload) => void,
  ): ConnectionsHealthChannel;
  subscribe(): ConnectionsHealthChannel;
}

interface ConnectionsHealthClient {
  from(table: string): {
    select(columns: string): {
      order(
        column: string,
        options?: { ascending?: boolean },
      ): Promise<{ data: ConnectionRow[] | null; error: { message: string } | null }>;
    };
  };
  channel(name: string): ConnectionsHealthChannel;
  removeChannel(channel: ConnectionsHealthChannel): unknown;
}

export type InvokeConnect = (
  instanceName: string,
) => Promise<{ data?: unknown; error?: unknown }>;

export interface ConnectionsHealthStoreDeps {
  client?: unknown;
  invokeConnect?: InvokeConnect;
  now?: () => number;
}

function toHealth(row: ConnectionRow): ConnectionHealth {
  const status = row.status ?? 'disconnected';
  return {
    id: row.id,
    name: row.name ?? '',
    phoneNumber: row.phone_number ?? null,
    instanceId: row.instance_id ?? null,
    status,
    isDefault: Boolean(row.is_default),
    healthy: status === HEALTHY_STATUS,
  };
}

const defaultInvokeConnect: InvokeConnect = (instanceName) =>
  supabase.functions.invoke('evolution-api/connect', {
    method: 'POST',
    body: { instanceName },
  });

export function createConnectionsHealthStore(deps: ConnectionsHealthStoreDeps = {}) {
  const client = (deps.client ?? supabase) as unknown as ConnectionsHealthClient;
  const invokeConnect: InvokeConnect = deps.invokeConnect ?? defaultInvokeConnect;
  const now = deps.now ?? (() => Date.now());

  let state: ConnectionsHealthState = {
    connections: [],
    loading: true,
    error: null,
    history: [],
    reconnecting: null,
    reconnectingAll: false,
  };
  // Fonte do histórico: também vive fora do `state` para o clearHistory não
  // depender de uma leitura intermediária de render.
  let history: DisconnectEvent[] = [];
  // Status anterior por conexão — a queda só vira evento quando a conexão
  // ESTAVA conectada antes; na primeira carga nada é "queda".
  let previousStatuses = new Map<string, string>();
  let channel: ConnectionsHealthChannel | null = null;
  // Descarta a resposta de um refresh que ficou para trás (ex.: dois refresh
  // seguidos, ou realtime chegando durante a busca): sem isso a resposta
  // atrasada sobrescreve o estado mais novo ou deixa o `loading` preso.
  let fetchGeneration = 0;
  const inflight = new Set<string>();
  const listeners = new Set<() => void>();

  function setState(partial: Partial<ConnectionsHealthState>) {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener());
  }

  function applyConnections(rows: ConnectionHealth[]) {
    const dropped: DisconnectEvent[] = [];
    for (const row of rows) {
      if (!row.healthy && previousStatuses.get(row.id) === HEALTHY_STATUS) {
        dropped.push({
          connectionId: row.id,
          instanceId: row.instanceId,
          name: row.name,
          at: now(),
        });
      }
    }
    previousStatuses = new Map(rows.map((row) => [row.id, row.status]));
    if (dropped.length > 0) {
      history = [...dropped, ...history].slice(0, HISTORY_MAX_ENTRIES);
    }
    setState({ connections: rows, history });
  }

  function handlePayload(payload: RealtimePayload) {
    const id = payload.new?.id ?? payload.old?.id;
    if (!id) return;

    if (payload.eventType === 'DELETE') {
      applyConnections(state.connections.filter((connection) => connection.id !== id));
      return;
    }

    const incoming: Partial<ConnectionRow> = payload.new ?? {};
    const existing = state.connections.find((connection) => connection.id === id);
    const merged = toHealth({
      id,
      name: incoming.name ?? existing?.name ?? '',
      phone_number: incoming.phone_number ?? existing?.phoneNumber ?? null,
      instance_id: incoming.instance_id ?? existing?.instanceId ?? null,
      status: incoming.status ?? existing?.status ?? 'disconnected',
      is_default: incoming.is_default ?? existing?.isDefault ?? false,
    });
    const next =
      existing !== undefined
        ? state.connections.map((connection) => (connection.id === id ? merged : connection))
        : [merged, ...state.connections];
    applyConnections(next);
  }

  function start() {
    if (!channel) {
      channel = client
        .channel(CONNECTIONS_HEALTH_CHANNEL)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_connections' },
          handlePayload,
        )
        .subscribe();
    }
    void refresh();
  }

  function stop() {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
  }

  function subscribe(listener: () => void): () => void {
    const wasEmpty = listeners.size === 0;
    listeners.add(listener);
    if (wasEmpty) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }

  async function refresh(): Promise<void> {
    const generation = ++fetchGeneration;
    setState({ loading: true, error: null });
    const { data, error } = await client
      .from('whatsapp_connections')
      .select('id, name, phone_number, instance_id, status, is_default')
      .order('created_at', { ascending: false });

    if (generation !== fetchGeneration) return;

    if (error) {
      log.error('connections-health: falha ao carregar conexões', error);
      setState({ loading: false, error: error.message });
      return;
    }
    applyConnections((data ?? []).map(toHealth));
    setState({ loading: false, error: null });
  }

  async function attemptReconnect(connection: ConnectionHealth): Promise<ReconnectResult> {
    if (!connection.instanceId) {
      return { ok: false, error: 'Conexão sem instância configurada — reconexão indisponível.' };
    }
    // Clique duplo / reconectar + reconectar-todas ao mesmo tempo: a segunda
    // chamada para a MESMA conexão é ignorada em vez de disparar outra requisição.
    if (inflight.has(connection.id)) return { ok: false, skipped: true };

    inflight.add(connection.id);
    setState({ reconnecting: connection.id });
    try {
      const { data, error } = await invokeConnect(connection.instanceId);
      if (error) {
        throw new Error(error instanceof Error ? error.message : 'Falha ao chamar a evolution-api');
      }
      const payload = data as { error?: boolean; message?: string } | null | undefined;
      if (payload?.error === true) {
        throw new Error(payload.message || 'Erro na Evolution API');
      }
      return { ok: true };
    } catch (err) {
      log.error('connections-health: falha ao reconectar', err);
      return { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    } finally {
      inflight.delete(connection.id);
      setState({ reconnecting: state.reconnecting === connection.id ? null : state.reconnecting });
    }
  }

  async function reconnect(connectionId: string): Promise<ReconnectResult> {
    const connection = state.connections.find((item) => item.id === connectionId);
    if (!connection) return { ok: false, error: 'Conexão não encontrada.' };
    return attemptReconnect(connection);
  }

  async function reconnectAll(): Promise<ReconnectAllSummary> {
    const targets = state.connections.filter((connection) => !connection.healthy);
    const summary: ReconnectAllSummary = { total: targets.length, ok: 0, skipped: 0, failed: 0 };
    if (targets.length === 0) return summary;

    setState({ reconnectingAll: true });
    try {
      for (const target of targets) {
        const result = await attemptReconnect(target);
        if (result.ok) summary.ok += 1;
        else if (result.skipped) summary.skipped += 1;
        else summary.failed += 1;
      }
    } finally {
      setState({ reconnectingAll: false, reconnecting: null });
    }
    return summary;
  }

  function clearHistory() {
    history = [];
    setState({ history });
  }

  return {
    subscribe,
    getSnapshot: () => state,
    refresh,
    reconnect,
    reconnectAll,
    clearHistory,
  };
}

export type ConnectionsHealthStore = ReturnType<typeof createConnectionsHealthStore>;

/** Instância global — todos os consumidores de `useConnectionsHealth` compartilham. */
export const connectionsHealthStore = createConnectionsHealthStore();

export interface ConnectionsHealthData extends ConnectionsHealthState {
  disconnected: ConnectionHealth[];
  total: number;
  connectedCount: number;
  hasIssue: boolean;
  reconnect: (connectionId: string) => Promise<ReconnectResult>;
  reconnectAll: () => Promise<ReconnectAllSummary>;
  clearHistory: () => void;
  refresh: () => Promise<void>;
}

export function useConnectionsHealth(
  store: ConnectionsHealthStore = connectionsHealthStore,
): ConnectionsHealthData {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return useMemo(() => {
    const disconnected = state.connections.filter((connection) => !connection.healthy);
    return {
      ...state,
      disconnected,
      total: state.connections.length,
      connectedCount: state.connections.length - disconnected.length,
      hasIssue: disconnected.length > 0,
      reconnect: store.reconnect,
      reconnectAll: store.reconnectAll,
      clearHistory: store.clearHistory,
      refresh: store.refresh,
    };
  }, [state, store]);
}
