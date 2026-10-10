import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockFrom, mockSelect } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

const selectCalls: string[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom.mockImplementation((table: string) => {
      const makeChain = () => {
        const chain = Object.assign(
          Promise.resolve({ data: [], error: null }),
          {
            select: mockSelect.mockImplementation((cols: string) => {
              selectCalls.push(`${table}:${cols}`);
              return makeChain();
            }),
            order: vi.fn().mockImplementation(() => makeChain()),
            in: vi.fn().mockImplementation(() => makeChain()),
            eq: vi.fn().mockImplementation(() => makeChain()),
            limit: vi.fn().mockImplementation(() => makeChain()),
            single: vi.fn().mockImplementation(() => makeChain()),
            update: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          },
        );
        return chain;
      };
      return makeChain();
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData } from '@/components/admin/useAdminData';

describe('useAdminData — select explícito (sem select(\'*\'))', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCalls.length = 0;
  });

  it('profiles usa colunas explícitas, não *', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.fetchData();
    });
    const profilesSelect = selectCalls.find(c => c.startsWith('profiles:'));
    expect(profilesSelect).toBeDefined();
    expect(profilesSelect!).not.toContain("'*'");
    expect(profilesSelect!).not.toContain(':*');
  });

  it('user_roles usa colunas explícitas, não *', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.fetchData();
    });
    const rolesSelect = selectCalls.find(c => c.startsWith('user_roles:'));
    expect(rolesSelect).toBeDefined();
    expect(rolesSelect!).not.toContain("'*'");
    expect(rolesSelect!).not.toContain(':*');
  });

  it('audit_logs usa colunas explícitas, não *', async () => {
    const { result } = renderHook(() => useAdminData('audit'));
    await act(async () => {
      await result.current.fetchData();
    });
    const logsSelect = selectCalls.find(c => c.startsWith('audit_logs:'));
    expect(logsSelect).toBeDefined();
    expect(logsSelect!).not.toContain("'*'");
    expect(logsSelect!).not.toContain(':*');
  });
});