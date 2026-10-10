import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  existingContact: null as null | { id: string; name: string },
  insertPayloads: [] as Record<string, unknown>[],
  eqPhoneArgs: [] as string[],
  sendOutboundMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mocks.sendOutboundMessage(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (field: string, value: unknown) => {
          // registra o valor consultado por telefone para provar que a checagem
          // de duplicidade usa o telefone LIMPO (só dígitos), não o formatado
          if (field === 'phone') mocks.eqPhoneArgs.push(String(value));
          return {
            maybeSingle: async () => ({ data: mocks.existingContact, error: null }),
            // usado pelo useEffect de conexões (whatsapp_connections): encadeado com .then
            then: (cb: (v: unknown) => void) => cb({ data: [] }),
          };
        },
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

describe('useNewConversation — criação de contato e invalidação de contadores', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    mocks.existingContact = null;
    mocks.insertPayloads = [];
    mocks.eqPhoneArgs = [];
    mocks.sendOutboundMessage.mockReset();
    mocks.sendOutboundMessage.mockResolvedValue(undefined);
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it('cria contato com telefone normalizado, invalida os contadores e envia a mensagem', async () => {
    const onStarted = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useNewConversation(true, onStarted, onClose));

    act(() => {
      result.current.setMode('new');
      // telefone FORMATADO — o cleanedNewPhone deve ser só dígitos ('11999990000')
      result.current.setNewPhone('(11) 99999-0000');
      result.current.setNewName('Fulano de Teste');
      result.current.setMessageText('Olá');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    // payload do insert: telefone LIMPO (só dígitos) + nome + connection null
    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0]).toEqual(expect.objectContaining({
      name: 'Fulano de Teste',
      phone: '11999990000',
      whatsapp_connection_id: null,
    }));

    // a checagem de duplicidade consultou o telefone LIMPO, não o formatado
    expect(mocks.eqPhoneArgs).toContain('11999990000');

    // invalida as duas queries agregadas (via invalidateContactsAggregates)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-kpi'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-type-counts'] });

    // envia a mensagem para o contato criado e fecha o fluxo
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'novo-id',
      content: 'Olá',
      messageType: 'text',
      whatsappConnectionId: null,
    }));
    expect(onStarted).toHaveBeenCalledWith('novo-id');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('não cria contato duplicado quando já existe um com o telefone', async () => {
    mocks.existingContact = { id: 'existente', name: 'Contato Existente' };
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));

    act(() => {
      result.current.setMode('new');
      result.current.setNewPhone('(11) 99999-0000');
      result.current.setNewName('Outro Nome');
      result.current.setMessageText('Olá');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    // nenhum insert, nenhuma invalidação, nenhum envio — só o erro de duplicidade
    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Já existe um contato com este número: Contato Existente');
  });
});
