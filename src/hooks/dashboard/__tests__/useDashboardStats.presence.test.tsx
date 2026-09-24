import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const profiles = [
  { id: 'p1', user_id: 'u1', name: 'Alpha', is_active: true, role: 'agent' },
  { id: 'p2', user_id: 'u2', name: 'Beta', is_active: true, role: 'agent' },
  { id: 'p3', user_id: 'u3', name: 'Gama', is_active: false, role: 'agent' },
  { id: 'p4', user_id: 'u4', name: 'Delta', is_active: true, role: 'supervisor' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') return { select: () => ({ or: () => Promise.resolve({ data: profiles, error: null }) }) };
      if (table === 'contacts') return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

const presence = { u1: 'online', u2: 'away', u3: 'online' };
vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceMap: () => presence }));

import { useDashboardStats } from '@/hooks/dashboard/useDashboardStats';

describe('useDashboardStats — Atendentes Online por presença', () => {
  it('conta só quem está com conta ativa E conectado com status Online', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDashboardStats({}), { wrapper });

    await waitFor(() => expect(result.current.agents).toBeDefined());

    // u1 online+ativo = conta; u2 ausente = não; u3 online mas conta inativa = não; u4 sem presença = não
    expect(result.current.agents?.onlineAgents).toBe(1);
    expect(result.current.agents?.totalAgents).toBe(4);
  });
});
