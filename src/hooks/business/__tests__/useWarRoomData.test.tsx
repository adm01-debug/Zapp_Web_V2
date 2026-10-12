import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// R2-MOD-030 / PB-11 — War Room: os números vêm dos RPCs `warroom_agent_today` e
// `warroom_queue_stats` (agregados no banco); cadastro habilitado não é presença; amostra
// ausente é `null` (a tela mostra '—'), nunca zero; e o cliente não varre `contacts`/`conversation_sla`.
const h = vi.hoisted(() => {
  const state = {
    presence: {} as Record<string, string>,
    agentRows: [] as unknown[],
    queueRows: [] as unknown[],
    agentError: null as { message: string } | null,
    queueError: null as { message: string } | null,
    rpcCalls: [] as { fn: string; args: unknown }[],
    tablesRead: [] as string[],
  };

  const activeProfiles = [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }];

  function reset() {
    state.presence = {};
    state.agentRows = [{
      id: 'p1', name: 'Alpha', avatar: null, maxChats: 5, activeChats: 1,
      resolvedToday: 4, avgResponseTime: 30, satisfaction: 80,
    }];
    state.queueRows = [{
      id: 'q1', name: 'Fila A', color: '#ccc', waiting: 1, inProgress: 1,
      slaBreaches: 0, slaWarnings: null, avgWaitTime: null,
    }];
    state.agentError = null;
    state.queueError = null;
    state.rpcCalls = [];
    state.tablesRead = [];
  }

  // Leitura mínima de profiles (id → user_id) para o store de presença; nenhum dado de métrica.
  function tableQuery(table: string) {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: table === 'profiles' ? activeProfiles : [], error: null })),
    };
    return q;
  }

  return { state, reset, tableQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => {
      h.state.rpcCalls.push({ fn, args });
      if (fn === 'warroom_agent_today') return Promise.resolve({ data: h.state.agentRows, error: h.state.agentError });
      if (fn === 'warroom_queue_stats') return Promise.resolve({ data: h.state.queueRows, error: h.state.queueError });
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      h.state.tablesRead.push(table);
      return h.tableQuery(table);
    },
  },
}));

// A presença vem da tabela agent_presence (via useAgentPresenceMap); aqui controlamos o mapa.
vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => h.state.presence,
}));

import { useWarRoomData, useWarRoomMetrics } from '../useWarRoomData';

function makeWrapper(qc?: QueryClient) {
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useWarRoomData — leituras por RPC, nulos e presença (R2-MOD-030 / PB-11)', () => {
  beforeEach(() => {
    h.reset();
  });

  it('lê pelos RPCs, expõe estado e não varre contacts/conversation_sla no cliente', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.agents).toHaveLength(1));

    // as duas leituras são RPCs, não selects encadeados de tabelas
    const chamados = h.state.rpcCalls.map((c) => c.fn);
    expect(chamados).toContain('warroom_agent_today');
    expect(chamados).toContain('warroom_queue_stats');

    // nenhuma varredura de contatos/SLA: não dá para cortar em 1000 linhas e virar subtotal silencioso
    expect(h.state.tablesRead).not.toContain('contacts');
    expect(h.state.tablesRead).not.toContain('conversation_sla');

    // estado exposto para a tela
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });

  it('cadastro habilitado sem presença não é online; a presença online vira status', async () => {
    const semPresenca = renderHook(() => useWarRoomData(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(semPresenca.result.current.agents).toHaveLength(1));
    expect(semPresenca.result.current.agents[0].status).toBe('offline');

    h.state.presence = { u1: 'online' };
    const comPresenca = renderHook(() => useWarRoomData(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(comPresenca.result.current.agents[0]?.status).toBe('online'));

    const metrics = renderHook(
      () => useWarRoomMetrics(comPresenca.result.current.agents, comPresenca.result.current.queues),
      { wrapper: makeWrapper().wrapper },
    );
    expect(metrics.result.current.onlineAgents).toBe(1);
  });

  it('RPC sem amostra mantém null (não vira zero) para agentes e filas', async () => {
    h.state.agentRows = [
      { id: 'p1', name: 'Alpha', avatar: null, maxChats: 5, activeChats: 0, resolvedToday: 0, avgResponseTime: null, satisfaction: null },
    ];
    h.state.queueRows = [
      { id: 'q1', name: 'Fila A', color: null, waiting: 0, inProgress: 0, slaBreaches: 0, slaWarnings: null, avgWaitTime: null },
    ];
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.agents).toHaveLength(1));
    await waitFor(() => expect(result.current.queues).toHaveLength(1));

    expect(result.current.agents[0].avgResponseTime).toBeNull();  // não medido ≠ 0s
    expect(result.current.agents[0].satisfaction).toBeNull();     // sem avaliação ≠ satisfação 0
    expect(result.current.queues[0].slaWarnings).toBeNull();      // não medido ≠ risco zero
    expect(result.current.queues[0].avgWaitTime).toBeNull();      // não medido ≠ 0 min
  });

  it('erro do RPC propaga como isError/error, sem engolir', async () => {
    h.state.agentError = { message: 'permission denied' };
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('permission denied');
  });

  it('o intervalo de atualização é do chamador (30s por padrão; false desliga)', async () => {
    const padrao = makeWrapper();
    renderHook(() => useWarRoomData(), { wrapper: padrao.wrapper });
    await waitFor(() => expect(h.state.rpcCalls.length).toBeGreaterThan(0));

    const optsAgentes = padrao.client.getQueryCache().find({ queryKey: ['warroom-agents'] })?.options as { refetchInterval?: number | false };
    const optsFilas = padrao.client.getQueryCache().find({ queryKey: ['warroom-queues'] })?.options as { refetchInterval?: number | false };
    expect(optsAgentes.refetchInterval).toBe(30000);
    expect(optsFilas.refetchInterval).toBe(30000);

    const desligado = makeWrapper();
    renderHook(() => useWarRoomData({ refetchInterval: false }), { wrapper: desligado.wrapper });
    await waitFor(() => expect(h.state.rpcCalls.length).toBeGreaterThan(0));
    const optsDesligado = desligado.client.getQueryCache().find({ queryKey: ['warroom-agents'] })?.options as { refetchInterval?: number | false };
    expect(optsDesligado.refetchInterval).toBe(false);
  });

  it('métricas: satisfação ignora agente sem amostra e "Em Risco" fica null sem fila medida', async () => {
    h.state.agentRows = [
      { id: 'p1', name: 'Alpha', avatar: null, maxChats: 5, activeChats: 1, resolvedToday: 4, avgResponseTime: 30, satisfaction: 80 },
      { id: 'p2', name: 'Beta', avatar: null, maxChats: 5, activeChats: 0, resolvedToday: 0, avgResponseTime: null, satisfaction: null },
    ];
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.agents).toHaveLength(2));

    const metrics = renderHook(() => useWarRoomMetrics(result.current.agents, result.current.queues), { wrapper });
    // só p1 tem amostra; média 80 (não 40, que seria o null puxando como zero)
    expect(metrics.result.current.avgSatisfaction).toBe(80);
    expect(metrics.result.current.totalWarnings).toBeNull();
  });
});
