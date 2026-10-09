import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// O mock do `supabase` precisa do `rpc`: `addCallNotes` grava pela RPC
// `set_call_agent_notes` (T13) e, sem ele, a chamada lança e o teste falha.
// A referência é preguiçosa de propósito (o factory do `vi.mock` roda antes da
// inicialização das consts do módulo).
const mockRpc = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }));
  return {
    supabase: {
      from: mockFrom,
      rpc: (...args: unknown[]) => mockRpc(...args),
      auth: { getUser: vi.fn() },
    },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useCalls } from '../communication/useCalls';

describe('useCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('T91: não expõe mais os métodos legados — só o que tem consumidor de produção', () => {
    // Este assert roda o hook REAL: se alguém reintroduzir `startCall` (ou os
    // outros três) na superfície do hook, o teste volta a ficar vermelho.
    const { result } = renderHook(() => useCalls());
    for (const metodo of ['startCall', 'answerCall', 'endCall', 'missCall']) {
      expect(result.current).not.toHaveProperty(metodo);
    }
    expect(typeof result.current.addCallNotes).toBe('function');
    expect(typeof result.current.getContactCalls).toBe('function');
  });

  it('should add notes to a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', 'Test note');
    });
    expect(success).toBe(true);
    // T13: a anotação sai pela RPC, nunca por escrita de coluna em `calls`.
    expect(mockRpc).toHaveBeenCalledWith('set_call_agent_notes', {
      p_call_id: 'call-1',
      p_notes: 'Test note',
    });
  });

  it('should get contact calls', async () => {
    const { result } = renderHook(() => useCalls());
    let calls: unknown[] = [];
    await act(async () => {
      calls = await result.current.getContactCalls('contact-1');
    });
    expect(Array.isArray(calls)).toBe(true);
  });

  it('should handle addCallNotes with empty notes', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', '');
    });
    expect(success).toBe(true);
    // Anotação vazia também vai pela RPC (a RPC decide o que fazer com isso).
    expect(mockRpc).toHaveBeenCalledWith('set_call_agent_notes', {
      p_call_id: 'call-1',
      p_notes: '',
    });
  });
});
