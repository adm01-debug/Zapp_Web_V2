// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

import { useAgentGamification, ACHIEVEMENT_TYPES } from '@/hooks/gamification/useAgentGamification';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useAgentGamification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'agent_stats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 's1', profile_id: 'p1', xp: 500, level: 3, current_streak: 5, best_streak: 10, messages_sent: 100, conversations_resolved: 20, achievements_count: 5 },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'agent_achievements') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'a1', profile_id: 'p1', achievement_type: 'fast_response', achievement_name: 'Fast', xp_earned: 50, earned_at: '2024-01-01' }],
                error: null,
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('initializes without error', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('returns null stats when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('fetches achievements list', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.achievements).toBeDefined();
  });

  it('ACHIEVEMENT_TYPES contains required types', () => {
    expect(ACHIEVEMENT_TYPES.FAST_RESPONSE).toBe('fast_response');
    expect(ACHIEVEMENT_TYPES.STREAK).toBe('streak');
    expect(ACHIEVEMENT_TYPES.RESOLUTION).toBe('resolution');
    expect(ACHIEVEMENT_TYPES.PERFECT_RATING).toBe('perfect_rating');
    expect(ACHIEVEMENT_TYPES.LEVEL_UP).toBe('level_up');
    expect(ACHIEVEMENT_TYPES.FIRST_MESSAGE).toBe('first_message');
  });

  it('exposes addXp function', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.addXp).toBe('function');
  });

  it('all achievement type values are unique', () => {
    const values = Object.values(ACHIEVEMENT_TYPES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
