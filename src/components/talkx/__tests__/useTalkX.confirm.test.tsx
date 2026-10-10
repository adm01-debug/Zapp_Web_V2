/**
 * Teste do hook confirmCampaignLaunch (N-099).
 *
 * 1. confirmar chama confirm_talkx_campaign_launch com a revisao atual
 *    e as 3 confirmacoes marcadas.
 * 2. Quando a revisao esta desatualizada (stale), a RPC retorna erro e
 *    o hook mostra o erro de revisao velha (toast.error + { ok: false }).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  const rpc = vi.fn();
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  const supabase = { rpc, channel: vi.fn(() => channel), removeChannel: vi.fn() };
  return { rpc, channel, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'auth-user-1', role: 'admin' } }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useTalkX } from '@/hooks/integrations/useTalkX';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('confirmCampaignLaunch', () => {
  beforeEach(() => {
    h.rpc.mockResolvedValue({ data: { ok: true, applied: true }, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('chama confirm_talkx_campaign_launch com a revisao atual e as 3 confirmacoes', async () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });

    await act(async () => {
      const res = await result.current.confirmCampaignLaunch(
        'camp-1',
        5,
        { consent: true, content: true, suppression: true },
      );
      expect(res.ok).toBe(true);
      expect(res.applied).toBe(true);
    });

    expect(h.rpc).toHaveBeenCalledWith('confirm_talkx_campaign_launch', {
      p_campaign_id: 'camp-1',
      p_expected_revision: 5,
      p_confirmations: { consent: true, content: true, suppression: true },
      p_mode: 'confirm',
    });
  });

  it('mostra erro de revisao velha quando a RPC recusa por revisao desatualizada', async () => {
    const { toast } = await import('sonner');
    h.rpc.mockResolvedValue({
      data: { ok: false, error: 'Revisao desatualizada: esperada 3, atual 7' },
      error: null,
    });

    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });

    let res: { ok: boolean; applied: boolean } | null = null;
    await act(async () => {
      res = await result.current.confirmCampaignLaunch(
        'camp-1',
        3,
        { consent: true, content: true, suppression: true },
      );
    });

    expect(res).toBeDefined();
    expect(res!.ok).toBe(false);
    expect(res!.applied).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Revisao desatualizada'),
    );
  });
});