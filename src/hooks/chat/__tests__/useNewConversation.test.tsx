import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  existingContact: null as null | { id: string; name: string },
  insertPayloads: [] as Record<string, unknown>[],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.existingContact, error: null }),
          // usado pelo useEffect de conexões (whatsapp_connections): encadeado com .then
          then: (cb: (v: unknown) => void) => cb({ data: [] }),
        }),
        or: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        mocks.insertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'novo-id' }, error: null }),
          }),
        };
      },
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import { useNewConversation } from '../useNewConversation';

describe('useNewConversation — invalida contadores por tipo ao criar contato', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    mocks.existingContact = null;
    mocks.insertPayloads = [];
  });

  it('após criar contato no modo "novo", invalida contacts-kpi E contacts-type-counts', async () => {
    const onStarted = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useNewConversation(true, onStarted, onClose));

    act(() => {
      result.current.setMode('new');
      result.current.setNewPhone('5511999990000');
      result.current.setNewName('Fulano de Teste');
      result.current.setMessageText('Olá');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-kpi'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-type-counts'] });
  });
});
