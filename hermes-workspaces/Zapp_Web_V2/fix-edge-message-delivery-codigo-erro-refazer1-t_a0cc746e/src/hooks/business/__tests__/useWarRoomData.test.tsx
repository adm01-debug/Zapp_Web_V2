import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// R2-MOD-030 — War Room não pode ler cadastro habilitado como presença, contato atribuído
// (inclusive resolvido) como atendimento ativo, nem anunciar espera/risco fixos em zero.
const h = vi.hoisted(() => {
  const state = { presence: {} as Record<string, string> };

  const profiles = [{ id: 'p1', user_id: 'u1', name: 'Alpha', avatar_url: null, is_active: true, max_chats: 5 }];
  const stats = [{
    profile_id: 'p1', messages_sent: 10, conversations_resolved: 4,
    avg_response_time_seconds: 30, customer_satisfaction_score: 4.5,
  }];
  const queues = [{ id: 'q1', name: 'Fila A', color: '#ccc', is_active: true }];
  const contacts = [
    { id: 'c1', queue_id: 'q1', assigned_to: null, conversation_status: 'waiting' },   // esperando
    { id: 'c2', queue_id: 'q1', assigned_to: 'p1', conversation_status: 'open' },      // em atendimento
    { id: 'c3', queue_id: 'q1', assigned_to: 'p1', conversation_status: 'resolved' },  // resolvido
  ];

  function resolveData(table: string, filters: unknown[][]) {
    if (table === 'profiles') return profiles;
    if (table === 'agent_stats') return stats;
    if (table === 'queues') return queues;
    if (table === 'conversation_sla') return [];
    if (table === 'contacts') {
      const filtraStatus = filters.some((f) => f[0] === 'eq' && f[1] === 'conversation_status' && f[2] === 'open');
      if (filtraStatus) return contacts.filter((c) => c.conversation_status === 'open');
      const semResolvidos = filters.some((f) => f[0] === 'not' && f[1] === 'conversation_status');
      if (semResolvidos) return contacts.filter((c) => c.conversation_status !== 'resolved' && c.conversation_status !== 'archived');
      return contacts; // baseline: select cru, sem filtro de episódio
    }
    return [];
  }

  function makeQuery(table: string) {
    const filters: unknown[][] = [];
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (...a: unknown[]) => { filters.push(['eq', ...a]); return q; },
      not: (...a: unknown[]) => { filters.push(['not', ...a]); return q; },
      is: (...a: unknown[]) => { filters.push(['is', ...a]); return q; },
      in: (...a: unknown[]) => { filters.push(['in', ...a]); return q; },
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const all = resolveData(table, filters);
        const data = from === null ? all.slice(0, 1000) : all.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.makeQuery(table) },
}));

// A presença vem da tabela agent_presence (via useAgentPresenceMap); aqui controlamos o mapa.
vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => h.state.presence,
}));

import { useWarRoomData, useWarRoomMetrics } from '../useWarRoomData';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useWarRoomData — presença e episódio ativo (R2-MOD-030)', () => {
  beforeEach(() => {
    h.state.presence = {};
  });

  it('perfil habilitado sem presença não é online; contato resolvido não ocupa capacidade', async () => {
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.agents).toHaveLength(1));

    // cadastro is_active=true, mas ninguém publicou presença → offline
    expect(result.current.agents[0].status).toBe('offline');
    // só o episódio aberto conta (c2); o resolvido (c3) não
    expect(result.current.agents[0].activeChats).toBe(1);
  });

  it('contagem de online/satisfação usa o status de presença, não o cadastro', async () => {
    h.state.presence = { u1: 'online' };
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.agents[0]?.status).toBe('online'));

    const metrics = renderHook(() => useWarRoomMetrics(result.current.agents, result.current.queues), { wrapper });
    expect(metrics.result.current.onlineAgents).toBe(1);
  });

  it('fila conta espera e atendimento por episódio, e não inventa zero para o que não é medido', async () => {
    const { result } = renderHook(() => useWarRoomData(), { wrapper });

    await waitFor(() => expect(result.current.queues).toHaveLength(1));

    const fila = result.current.queues[0];
    expect(fila.waiting).toBe(1);          // c1 sem responsável
    expect(fila.inProgress).toBe(1);       // só c2 (aberto); c3 resolvido fora
    expect(fila.avgWaitTime).toBeNull();   // não medido ≠ 0 min
    expect(fila.slaWarnings).toBeNull();   // não medido ≠ risco zero
  });

  it('métrica "Em Risco" agregada sai como não calculada quando nenhuma fila mede risco', async () => {
    const { result } = renderHook(() => useWarRoomData(), { wrapper });
    await waitFor(() => expect(result.current.queues).toHaveLength(1));

    const metrics = renderHook(() => useWarRoomMetrics(result.current.agents, result.current.queues), { wrapper });
    expect(metrics.result.current.totalWarnings).toBeNull();
  });
});
