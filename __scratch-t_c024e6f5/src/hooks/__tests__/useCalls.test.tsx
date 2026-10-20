import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
    // Depois do T91 o hook só lê `calls` (histórico por contato): não há mais
    // insert/update de escrita direta para montar aqui.
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));
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
