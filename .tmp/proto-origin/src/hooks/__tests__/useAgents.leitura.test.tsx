import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Estado controlado pelo teste: cada consulta da lista pode falhar isoladamente.
const h = vi.hoisted(() => {
  const erro = {
    profiles: null as { message: string } | null,
    queues: null as { message: string } | null,
    members: null as { message: string } | null,
    activeChats: null as { message: string } | null,
  };
  const profiles = [
    { id: 'p1', user_id: 'u1', name: 'Alpha', is_active: true, role: 'agent', max_chats: 5, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
  ];
  const queues = [{ id: 'q1', name: 'Comercial', color: '#fff' }];
  const members = [{ queue_id: 'q1', profile_id: 'p1' }];
  const contatos = [{ assigned_to: 'p1' }];
  return { erro, profiles, queues, members, contatos };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            not: () => ({
              order: () => ({
                data: h.erro.profiles ? null : h.profiles,
                error: h.erro.profiles,
              }),
            }),
          }),
        };
      }
      if (table === 'queues') {
        return {
          select: () => ({
            eq: () => ({ data: h.erro.queues ? null : h.queues, error: h.erro.queues }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: () => ({
            eq: () => ({ data: h.erro.members ? null : h.members, error: h.erro.members }),
          }),
        };
      }
      if (table === 'contacts') {
        // fetchAllRows monta `.eq/.is/.order/.range` antes de resolver: o mock é encadeável.
        const q: Record<string, unknown> = {
          select: () => q,
          not: () => q,
          eq: () => q,
          is: () => q,
          order: () => q,
          range: () => q,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              resolve({
                data: h.erro.activeChats ? null : h.contatos,
                error: h.erro.activeChats,
              }),
            ),
        };
        return q;
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    },
  },
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => ({ u1: 'online' }),
}));

import { useAgents } from '@/hooks/crm/useAgents';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

async function montar() {
  const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

beforeEach(() => {
  h.erro.profiles = null;
  h.erro.queues = null;
  h.erro.members = null;
  h.erro.activeChats = null;
});

describe('useAgents — erro de leitura de cada consulta', () => {
  it('leitura boa: nenhum erro exposto e a lista completa', async () => {
    const result = await montar();

    expect(result.current.error).toBeNull();
    expect(result.current.errors).toEqual({ profiles: null, queues: null, members: null, activeChats: null });
    expect(result.current.agents.map((a) => a.id)).toEqual(['p1']);
  });

  it('erro nos perfis é devolvido (antes era descartado)', async () => {
    h.erro.profiles = { message: 'perfis fora do ar' };
    const result = await montar();

    expect(result.current.errors.profiles?.message).toBe('perfis fora do ar');
    expect(result.current.error?.message).toBe('perfis fora do ar');
    expect(result.current.agents).toEqual([]);
  });

  it('erro nas filas é devolvido e a lista fica sem fila atribuída', async () => {
    h.erro.queues = { message: 'filas fora do ar' };
    const result = await montar();

    expect(result.current.errors.queues?.message).toBe('filas fora do ar');
    expect(result.current.error?.message).toBe('filas fora do ar');
    expect(result.current.errors.profiles).toBeNull();
    expect(result.current.agents[0].queues).toEqual([]);
  });

  it('erro nos vínculos (membros) é devolvido e a lista fica sem fila atribuída', async () => {
    h.erro.members = { message: 'vínculos fora do ar' };
    const result = await montar();

    expect(result.current.errors.members?.message).toBe('vínculos fora do ar');
    expect(result.current.error?.message).toBe('vínculos fora do ar');
    expect(result.current.agents[0].queues).toEqual([]);
  });

  it('erro nos chats ativos deixa a capacidade indisponível (null), nunca 0', async () => {
    h.erro.activeChats = { message: 'contatos fora do ar' };
    const result = await montar();

    expect(result.current.errors.activeChats?.message).toBe('contatos fora do ar');
    expect(result.current.error?.message).toBe('contatos fora do ar');
    expect(result.current.agents[0].activeChats).toBeNull();
    // Total desconhecido não vira subtotal: null, não 0.
    expect(result.current.stats.totalActiveChats).toBeNull();
  });
});
