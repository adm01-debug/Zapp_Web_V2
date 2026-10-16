import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const AGORA = new Date().toISOString();

const mockProfiles = [
  { id: 'p1', user_id: 'u1', name: 'Agent Alpha', is_active: true, role: 'agent', max_chats: 5, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
  { id: 'p2', user_id: 'u2', name: 'Agent Beta', is_active: false, role: 'agent', max_chats: 10, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
  // p3 mexeu no perfil AGORA (updated_at recente) e mesmo assim não pode virar "online":
  // perfil é cadastro, presença é o que o agente publica.
  { id: 'p3', user_id: 'u3', name: 'Agent Gamma', is_active: true, role: 'agent', max_chats: 10, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: AGORA },
];

const mockQueuesData = {
  queues: [{ id: 'q1', name: 'Support', color: '#blue' }],
  members: [{ queue_id: 'q1', profile_id: 'p1' }],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        // O hook pede `.select('*').not('is_active', 'is', false).order('name')`:
        // a conta desativada (is_active === false) sai da lista.
        const ativos = () => mockProfiles.filter((p) => p.is_active !== false);
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: ativos(), error: null }),
            }),
          }),
        };
      }
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockQueuesData.queues, error: null }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockQueuesData.members, error: null }),
          }),
        };
      }
      if (table === 'contacts') {
        // useAgents conta só o episódio ABERTO de cada atendente e lê paginado
        // (fetchAllRows monta `.eq/.is/.order/.range` antes de resolver), por isso o mock
        // é encadeável e devolve 2 conversas abertas do agente p1.
        const contatosAbertos = [{ assigned_to: 'p1' }, { assigned_to: 'p1' }];
        const q: Record<string, unknown> = {
          select: () => q,
          not: () => q,
          eq: () => q,
          is: () => q,
          order: () => q,
          range: () => q,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: contatosAbertos, error: null })),
        };
        return q;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  },
}));

import { useAgents } from '@/hooks/crm/useAgents';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combina os dados dos atendentes ATIVOS e deixa a conta desativada fora da lista', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // p2 é is_active: false — não atende, então não entra na lista nem nas contagens.
    expect(result.current.agents.map((a) => a.id)).toEqual(['p1', 'p3']);
    expect(result.current.stats.totalAgents).toBe(2);
    expect(result.current.error).toBeNull();
    expect(result.current.errors).toEqual({ profiles: null, queues: null, members: null, activeChats: null });
  });

  it('sem presença publicada o status é offline — updated_at do perfil não é presença', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // p3 tem updated_at de agora; mesmo assim, sem linha de presença, é offline.
    const byId = Object.fromEntries(result.current.agents.map((a) => [a.id, a.status]));
    expect(byId.p3).toBe('offline');
    expect(byId.p1).toBe('offline');
    expect(result.current.stats.onlineCount).toBe(0);
    expect(result.current.stats.awayCount).toBe(0);
    expect(result.current.stats.offlineCount).toBe(2);
  });

  it('a capacidade sai da consulta de conversas abertas (2 do p1) e é 0 só quando a leitura deu certo', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const porId = Object.fromEntries(result.current.agents.map((a) => [a.id, a]));
    expect(porId.p1.activeChats).toBe(2);
    // p3 não tem conversa aberta: 0 de verdade (leitura boa), não "indisponível".
    expect(porId.p3.activeChats).toBe(0);
    expect(result.current.stats.totalActiveChats).toBe(2);
  });
});
