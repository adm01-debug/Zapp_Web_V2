import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFrom = vi.fn();
// `rpc` é necessário desde o T13 (`addCallNotes` → `set_call_agent_notes`).
// Referência preguiçosa: o factory do `vi.mock` roda antes das consts do módulo.
const mockRpc = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useCalls } from '@/hooks/communication/useCalls';

describe('useCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
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
      if (table === 'calls') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'call-1' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('initializes with no active call', () => {
    const { result } = renderHook(() => useCalls());
    expect(result.current.currentCallId).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('startCall creates a new call record', async () => {
    const { result } = renderHook(() => useCalls());

    let callId: string | null = null;
    await act(async () => {
      callId = await result.current.startCall({
        contactPhone: '+5511999999999',
        contactName: 'John',
        direction: 'outbound',
      });
    });

    expect(callId).toBe('call-1');
  });

  it('startCall works without explicit contactId', async () => {
    const { result } = renderHook(() => useCalls());

    let callId: string | null = null;
    await act(async () => {
      callId = await result.current.startCall({
        contactPhone: '+5511999999999',
        contactName: 'John',
        direction: 'inbound',
      });
    });

    expect(callId).toBe('call-1');
  });

  it('endCall updates call status', async () => {
    const { result } = renderHook(() => useCalls());

    await act(async () => {
      await result.current.endCall('call-1', 120);
    });

    expect(mockFrom).toHaveBeenCalledWith('calls');
  });

  it('answerCall updates call to answered', async () => {
    const { result } = renderHook(() => useCalls());

    let success: boolean = false;
    await act(async () => {
      success = await result.current.answerCall('call-1');
    });

    expect(success).toBe(true);
  });

  it('addCallNotes grava pela RPC set_call_agent_notes (T13)', async () => {
    const { result } = renderHook(() => useCalls());

    let success: boolean = false;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', 'nota do agente');
    });

    expect(success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('set_call_agent_notes', {
      p_call_id: 'call-1',
      p_notes: 'nota do agente',
    });
  });

  it('addCallNotes devolve false quando a RPC falha (nada de sucesso silencioso)', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'perfil nao encontrado' } });
    const { result } = renderHook(() => useCalls());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', 'nota');
    });

    expect(success).toBe(false);
  });
});
