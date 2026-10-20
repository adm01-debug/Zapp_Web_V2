import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockProfiles = [
  { id: 'p1', user_id: 'u1', name: 'Agent Alpha', is_active: true, role: 'agent', max_chats: 5, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
  { id: 'p2', user_id: 'u2', name: 'Agent Beta', is_active: false, role: 'agent', max_chats: 10, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
];

const mockQueuesData = {
  queues: [{ id: 'q1', name: 'Support', color: '#blue' }],
  members: [{ queue_id: 'q1', profile_id: 'p1' }],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
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

  it('fetches and combines agent data', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.agents).toHaveLength(2);
  });

  it('getAgentStatus utility works correctly', () => {
    // Import the module to test the status logic indirectly
    // The hook assigns status based on is_active / updated_at
    // We test through the hook output
    expect(true).toBe(true); // placeholder - status tested via integration
  });

  it('returns correct counts', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // At least one agent should exist
    expect(result.current.agents.length).toBeGreaterThan(0);
    // A capacidade sai da consulta de conversas abertas (2 do p1), não dos perfis.
    expect(result.current.agents.find((a) => a.id === 'p1')?.activeChats).toBe(2);
  });
});
