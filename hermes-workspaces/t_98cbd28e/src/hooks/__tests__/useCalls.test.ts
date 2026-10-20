import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// O mock do `supabase` precisa do `rpc`: `addCallNotes` grava pela RPC
// `set_call_agent_notes` (T13) e, sem ele, a chamada lança e o teste falha.
// A referência é preguiçosa de propósito (o factory do `vi.mock` roda antes da
// inicialização das consts do módulo).
const mockRpc = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'call-1' }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
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

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

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

  it('should initialize with null currentCallId', () => {
    const { result } = renderHook(() => useCalls());
    expect(result.current.currentCallId).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should start a call and return call ID', async () => {
    const { result } = renderHook(() => useCalls());
    let callId: string | null = null;
    await act(async () => {
      callId = await result.current.startCall({
        contactPhone: '5511999',
        contactName: 'Test',
        direction: 'outbound',
      });
    });
    expect(callId).toBe('call-1');
  });

  it('should answer a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.answerCall('call-1');
    });
    expect(success).toBe(true);
  });

  it('should end a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.endCall('call-1', 120);
    });
    expect(success).toBe(true);
  });

  it('should mark call as missed', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.missCall('call-1');
    });
    expect(success).toBe(true);
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

  // === EDGE CASES ===

  it('should handle startCall with empty contactId', async () => {
    const { result } = renderHook(() => useCalls());
    let callId: string | null = 'nao-chamado';
    await act(async () => {
      callId = await result.current.startCall({
        contactPhone: '123',
        contactName: 'Test',
        direction: 'inbound',
      });
    });
    // Sem contactId a chamada não deixa de ser registrada: o hook grava
    // `contact_id: params.contactId || null` e devolve o id da linha criada
    // (useCalls.ts). O que não pode acontecer é cair no caminho de erro.
    expect(callId).toBe('call-1');
  });

  it('should handle endCall with zero duration', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.endCall('call-1', 0);
    });
    expect(success).toBe(true);
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
