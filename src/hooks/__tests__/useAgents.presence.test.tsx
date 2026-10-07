import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const profiles = [
  { id: 'p1', user_id: 'u1', name: 'Alpha', updated_at: '' },
  { id: 'p2', user_id: 'u2', name: 'Beta', updated_at: '' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') return { select: () => ({ order: () => Promise.resolve({ data: profiles, error: null }) }) };
      if (table === 'contacts') {
        // Consulta paginada (fetchAllRows): o mock precisa ser encadeável até resolver.
        const semConversasAbertas: Array<{ assigned_to: string | null }> = [];
        const q: Record<string, unknown> = {
          select: () => q,
          not: () => q,
          eq: () => q,
          is: () => q,
          order: () => q,
          range: () => q,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: semConversasAbertas, error: null })),
        };
        return q;
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => ({ u2: 'away' }),
}));

import { useAgents } from '@/hooks/crm/useAgents';

describe('useAgents + presença', () => {
  it('usa o status publicado pelo agente conectado e cai na estimativa por updated_at para os demais', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useAgents(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const byId = Object.fromEntries(result.current.agents.map((a) => [a.user_id, a.status]));
    expect(byId.u2).toBe('away');
    expect(byId.u1).toBe('offline');
  });
});
