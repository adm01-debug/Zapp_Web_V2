/**
 * X048 (TL-106) — testes do hook useTalkXServiceStatus.
 * Cobre as 3 combinações do campo whatsapp.connected.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { useTalkXServiceStatus } from '../useTalkXServiceStatus';

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTalkXServiceStatus', () => {
  it('whatsapp.connected = true quando existe conexão ativa', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ id: 'conn-1' }], error: null }));

    const { result } = renderHook(() => useTalkXServiceStatus());

    // Começa null enquanto a consulta não responde
    expect(result.current.whatsapp.connected).toBeNull();

    await waitFor(() => expect(result.current.whatsapp.connected).toBe(true));
    expect(result.current.crm).toBe('ok');
  });

  it('whatsapp.connected = false quando não existe conexão ativa', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const { result } = renderHook(() => useTalkXServiceStatus());

    await waitFor(() => expect(result.current.whatsapp.connected).toBe(false));
  });

  it('whatsapp.connected = null quando a consulta falha (não acusa "desconectado")', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'network error' } }));

    const { result } = renderHook(() => useTalkXServiceStatus());

    await waitFor(() => {
      // fica null — falha de consulta não é "desconectado"
      expect(result.current.whatsapp.connected).toBeNull();
    });
  });
});
