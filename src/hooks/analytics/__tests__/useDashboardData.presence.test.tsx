import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const queues = [
  {
    id: 'q1',
    name: 'Suporte',
    color: '#000',
    queue_members: [
      { is_active: true, profiles: { user_id: 'u1', is_active: true } },
      { is_active: true, profiles: { user_id: 'u2', is_active: true } },
      { is_active: true, profiles: { user_id: 'u3', is_active: false } },
      { is_active: false, profiles: { user_id: 'u1', is_active: true } },
    ],
  },
];
const statsResult = {
  agents: { agents: [], onlineAgents: 2, totalAgents: 3 },
  contacts: [],
  queues,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('@/hooks/dashboard/useDashboardStats', () => ({ useDashboardStats: () => statsResult }));
vi.mock('@/hooks/dashboard/useDashboardKpi', () => ({ useDashboardKpi: () => ({ data: null }) }));
const presence = { u1: 'online', u2: 'away', u3: 'online' };
vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceMap: () => presence }));

import { useDashboardData } from '@/hooks/analytics/useDashboardData';

describe('useDashboardData — online por fila via presença', () => {
  it('conta membro ativo, de perfil ativo e conectado como Online; repassa o total geral', () => {
    const { result } = renderHook(() => useDashboardData());

    const fila = result.current.stats?.queuesStats[0];
    expect(fila?.onlineAgents).toBe(1); // só u1 (u2 ausente, u3 conta inativa, 4º membro inativo)
    expect(fila?.totalAgents).toBe(4);
    expect(result.current.stats?.onlineAgents).toBe(2);
  });
});
